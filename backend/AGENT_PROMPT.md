# Backend Agent Prompt — AI Code Builder

> **Purpose:** Strategic design and development guide for building the FastAPI backend.
> This document describes *what* to build and *why*, not *how* to code it line-by-line.
> Follow every section in order. Consult `AGENT_GUIDE.md` for exact implementation details.

---

## 1. Understand the Application

This backend powers an **AI-assisted data transformation platform** with a core 5-step
workflow plus persistent library and caching features:

### Core Workflow (5 steps)

1. User uploads a CSV or XLSX file (optional: metadata-only file for schema-first workflows)
2. User writes plain-English transformation instructions
3. AI refines the instructions into a precise structured prompt (streamed)
4. AI generates Python transformation code from that prompt (streamed)
5. User runs the code; a preview of the output is shown; result is downloadable as CSV

### Persistence & Reuse Features

- **Code Library** — saves generated `.py` files to `CODE_LIBRARY_DIR/{public|private}/`. Files can be listed, retrieved, shared to public, shared with specific users, or deleted.
- **Instructions Library** — saves instruction templates as `.txt` files to `INSTRUCTIONS_LIBRARY_DIR/`. Supports list, retrieve, and delete.
- **Code Cache** — caches `label → {code, raw_instructions, refined_prompt}` as `.json` files in `CODE_CACHE_DIR/`. Allows instant recall of previously generated code for a named instruction.
- **File Summary** — computes per-column statistics (record count, null count, unique count, min/max) from the uploaded Parquet cache.
- **Column Values** — returns sample or full unique values for a specified column.

Every feature maps to one of these concerns. Before writing any file, understand
which concern it belongs to.

---

## 2. Technology Stack

| Concern | Choice | Why |
|---|---|---|
| Web framework | FastAPI >= 0.115 | Async-native, Pydantic integration, streaming support |
| ASGI server | Uvicorn >= 0.30 | Standard for FastAPI; supports `--reload` for dev |
| AI provider | Anthropic Python SDK >= 0.34 | Streaming via `.messages.stream()` context manager |
| Data processing | Pandas >= 2.2, PyArrow >= 16, openpyxl >= 3.1 | CSV/XLSX parsing; Parquet caching |
| Sandbox | RestrictedPython >= 7.1 (concept only — use subprocess isolation) | User code must never run in-process |
| Config management | Pydantic Settings >= 2.4 | Env-var-driven config with layered `.env` file support |
| Async file I/O | aiofiles >= 23 | Non-blocking file writes in async request handlers |
| Python version | >= 3.12 | Required for modern type union syntax and performance |

Do not introduce libraries outside this list without explicit justification. Prefer
stdlib solutions over new dependencies for simple utilities.

---

## 3. Project Structure Strategy

Organise the code into these concerns — one directory per concern:

- **`app/config/`** — All configuration lives here. Nothing else reads env vars directly.
- **`app/session/`** — In-memory session and job state. This is the application's database.
- **`app/schemas/`** — Pydantic request/response models. One file per API domain.
- **`app/prompts/`** — All AI prompt strings. Never embed prompts inside service files.
- **`app/sandbox/`** — Code validation (AST) and subprocess execution. Security-critical.
- **`app/services/`** — Business logic. Services call prompts, the sandbox, and the session store.
- **`app/utils/`** — Stateless helpers shared across layers (SSE formatting, file type detection).
- **`app/api/v1/`** — Route handlers. Thin layer: validate input, call a service, return a response.
- **`app/main.py`** — App factory only. Wires everything together; no business logic here.

**Key rule:** Dependencies only flow inward. API routes import services; services import
schemas and session; nothing in the inner layers imports from `api/`.

---

## 4. Configuration Design

**Strategy: layered env files, single singleton, no magic numbers in code.**

- Use Pydantic `BaseSettings` to define every configurable value with types, defaults, and validation constraints.
- Load config in priority order: built-in defaults → `.env` → `.env.<APP_ENV>` → `.env.<APP_ENV>.local` → OS environment variables.
- `APP_ENV` determines which overlay file is loaded. It must be discoverable without instantiating `Settings` (bootstrap problem — read `.env` with raw bytes, do not use Pydantic for this step).
- All directory paths must default to `tempfile.gettempdir()` sub-folders via `default_factory`. Never hardcode `/tmp` or `C:\Temp`.
- Five separate directory settings, each with a distinct lifetime and purpose:
  - `INBOUND_DIR` — uploaded files + Parquet caches (session-lifetime, should be persistent)
  - `CODE_LIBRARY_DIR` — saved `.py` snippets (long-lived, user-managed)
  - `INSTRUCTIONS_LIBRARY_DIR` — saved `.txt` instruction templates (long-lived, user-managed)
  - `CODE_CACHE_DIR` — `.json` label→code cache (long-lived, auto-managed)
  - `TEMP_DIR` — ephemeral sandbox artifacts (short-lived, can be on a fast scratch disk)
- Two model settings, one per AI use case: `REFINE_MODEL` (fast, low-token) and `CODEGEN_MODEL` (more capable). `LEGACY_MODEL` is a legacy fallback.
- Wrap `get_settings()` with `@lru_cache` — it must be a singleton. Never call the Settings constructor more than once per process.
- All `.env*` files except `.env.example` are gitignored. `.env.example` is the committed template.
- When reading `.env` files manually (for bootstrap), use a BOM-aware encoding fallback chain: `utf-8-sig` → `utf-16` → `latin-1`. This prevents `UnicodeDecodeError` on Windows where editors sometimes save as UTF-16.

---

## 5. Session Management Design

**Strategy: simple in-memory store with an asyncio lock. No database needed.**

- The session store is an in-memory dictionary keyed by `session_id` (UUID).
- Every upload creates a session. The session holds file metadata, paths, and a nested dictionary of execution jobs.
- Use `asyncio.Lock` for all reads and writes — FastAPI handles requests concurrently.
- Sessions expire based on `SESSION_TTL_SECONDS`. A background `asyncio` task runs cleanup every 15 minutes.
- This store is intentionally non-persistent. Restarting the server clears all sessions. Design the frontend around this assumption.
- Expose `get_or_404()` to make session validation in route handlers a one-liner.

---

## 6. Streaming (SSE) Design

**Strategy: every AI response streams to the browser. Never buffer the full response.**

- All AI calls use the Anthropic SDK's `.messages.stream()` async context manager, which yields text chunks as they arrive.
- Wrap every stream in an SSE event generator utility that formats chunks as `data: {"chunk": "...", "done": false}` events, terminating with `data: {"done": true}`.
- Error events use `data: {"error": "...", "done": true}` so the frontend can distinguish them from normal completion.
- Return FastAPI `StreamingResponse` with `media_type="text/event-stream"` and headers `Cache-Control: no-cache` and `X-Accel-Buffering: no` (the latter prevents Nginx from buffering the stream).
- The frontend consumes these events with the native `fetch` API and a `ReadableStream` reader. This is why Axios is not used for streaming endpoints.

---

## 7. File Upload Design

**Strategy: validate early, cache as Parquet, never re-read the original file.**

- Validate file extension and size **before** writing to disk. Fail fast on bad input.
- Detect actual file type by inspecting magic bytes (not just the extension) to prevent spoofing.
- Write the raw file to `INBOUND_DIR/{session_id}/` using `aiofiles` (non-blocking).
- Immediately parse the file into a Pandas DataFrame and cache it as Parquet alongside the original.
- Every subsequent operation (instruction refinement context, code generation sample, sandbox execution) reads the Parquet cache — never the original CSV/XLSX again. Parquet is significantly faster and preserves column types.

---

## 8. AI Prompt Design

**Strategy: prompts live in `app/prompts/`, never in service files. Keep them precise and constrained.**

Two prompts are needed:

### Instruction Refinement Prompt
- System role: requirements analyst.
- Input: raw user description + list of column names.
- Output: a structured prompt with sections — Objective, Input columns, Transformation steps, Output columns, Edge cases.
- Instruct the model to be concise and technical. Do not allow filler text.
- No code fences in output.

### Code Generation Prompt
- System role: senior Python data engineering assistant.
- Input: refined structured prompt + full schema (column names + dtypes) + 3 sample rows.
- Output: raw Python code only — no markdown fences, no explanatory comments outside code.
- The code **must** follow these I/O conventions (enforced by the sandbox):
  - Read input from `os.environ["INPUT_FILE_PATH"]` using `pd.read_parquet()`
  - Write output to `os.environ["OUTPUT_FILE_PATH"]` using `df_output.to_csv()`
  - Wrap all logic in a `main()` function; call it unconditionally at module level
- Provide an explicit allowlist of safe imports (pandas, numpy, os, pathlib, re, datetime, math, json, csv, collections, functools, itertools, typing).
- Provide an explicit blocklist of forbidden imports (subprocess, socket, requests, urllib, httpx, importlib, ctypes, sys, shutil, tempfile, pickle, eval, exec).
- Strip markdown fences from streamed output — the model sometimes wraps code in ` ```python ` despite instructions.

---

## 9. Code Execution Security Design

**Strategy: four independent security layers, all mandatory.**

Never trust AI-generated code. Apply all four layers in order:

| Layer | Mechanism | What it blocks |
|---|---|---|
| 1 — Prompt rules | System prompt constraints | Model generating forbidden imports in the first place |
| 2 — AST validation | Parse the source with Python's `ast` module before execution | Static detection of forbidden imports and `eval`/`exec` calls |
| 3 — Subprocess isolation | Run user code in `asyncio.create_subprocess_exec`, not in-process | A crash, OOM, or infinite loop cannot kill the FastAPI process |
| 4 — Restricted builtins | Wrapper script replaces `__builtins__` with a safe subset | Runtime abuse of `__import__`, `open`, or similar is blocked |

- AST validation happens synchronously before the job is queued. Reject with HTTP 400 immediately.
- The subprocess receives `INPUT_FILE_PATH` and `OUTPUT_FILE_PATH` via environment variables. Strip all proxy env vars before spawning the subprocess.
- Set a hard timeout (`SANDBOX_TIMEOUT_SECONDS`). Kill the subprocess on timeout.
- Job status transitions: `queued` → `running` → `success` | `error`. The HTTP `POST /execute` endpoint returns `job_id` immediately; the frontend polls `GET /execute/{session_id}/{job_id}`.

---

## 10. API Design

**Strategy: thin route handlers. No business logic in routes.**

Routes are responsible for:
1. Deserialising and validating the request body (Pydantic does this automatically)
2. Calling exactly one service function
3. Serialising and returning the response

Routes are NOT responsible for: reading files, calling Anthropic, running code, or managing sessions directly. All of that belongs in services.

### Route decisions
- `POST /upload` — `multipart/form-data`. Validate extension + size first, then call file service.
- `POST /instructions/refine` — JSON body. Return `StreamingResponse` from the instruction service stream.
- `POST /codegen/generate` — JSON body. Return `StreamingResponse` from the codegen service stream.
- `POST /codegen/fix` — JSON body. Return `StreamingResponse`. Same pattern as generate but with a fix-specific prompt.
- `POST /execute` — JSON body. Validate code, create job, return `{"job_id": "..."}` immediately. Non-blocking.
- `GET /execute/{session_id}/{job_id}` — Poll endpoint. Returns current job status and preview on success.
- `GET /execute/{session_id}/{job_id}/output` — Returns the output CSV as a `FileResponse`.
- `GET /health` — Returns env, version, and all three directory paths for ops visibility.

---

## 11. Application Factory Design

**Strategy: `create_app()` factory pattern. Validate everything before accepting traffic.**

The `main.py` file is an **app factory**, not a script. It:

1. Calls `get_settings()` to load config.
2. Calls `_configure_logging()` to set up console + rotating file handler (`RotatingFileHandler` writing to `LOG_DIR/app.<APP_ENV>.log`).
3. Uses FastAPI's `lifespan` context manager (not deprecated `on_event`) to run startup validation.
4. Startup validation (`_validate_startup()`) checks: `ANTHROPIC_API_KEY` is set; all three directories are writable. If any check fails, `sys.exit(1)` immediately — the process must not start silently broken.
5. Registers a background `asyncio` task for session cleanup inside the lifespan.
6. Adds CORS middleware using `ALLOWED_ORIGINS` from settings.
7. Adds HTTP middleware for security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) and request logging.
8. Registers a generic 500 exception handler that logs the full traceback but returns a sanitised error response.
9. Includes the v1 router under `settings.API_PREFIX`.
10. Returns the `FastAPI` instance. The module-level `app = create_app()` line is what Uvicorn picks up.

---

## 12. Cross-Platform Compatibility

This application runs on both Windows and Unix. Observe these rules:

- Use `Path` from `pathlib` everywhere — never string-concatenate paths with `/` or `\\`.
- Use `tempfile.gettempdir()` for default temp directories — never hardcode `/tmp`.
- When reading `.env` files directly (not via pydantic-settings), read raw bytes and try encoding fallbacks: `utf-8-sig` → `utf-16` → `latin-1`. Windows editors frequently save as UTF-16 with BOM.
- For subprocess execution, use `asyncio.create_subprocess_exec` with explicit `env=` rather than relying on inherited environment.
- The `scripts/manage.py` script handles venv creation, dependency installation, process management, and PID tracking for both Windows and Unix without any third-party dependencies.

---

## 13. Environment Setup Checklist

Before the first start:

1. Create `backend/.env` containing only `APP_ENV=development`.
2. Copy `backend/.env.example` to `backend/.env.development` and fill in `ANTHROPIC_API_KEY`.
3. Save both files as **UTF-8** (not UTF-16). In VSCode: click the encoding in the status bar → *Save with Encoding* → *UTF-8*.
4. Use `scripts\start.bat` (Windows) or `bash scripts/start.sh` (Unix) to launch.
   - First launch installs venv and pip dependencies automatically.
   - Use `--skip-deps` on subsequent starts for faster startup.

---

## 14. Key Design Decisions and Rationale

| Decision | Rationale |
|---|---|
| In-memory session store (no DB) | Keeps the backend stateless and dependency-free; sessions are ephemeral by design |
| Five separate storage directories | Each has a distinct lifetime (session vs. user-managed vs. ephemeral); can live on different storage volumes |
| Parquet cache on upload | 10-100x faster than re-reading CSV on every AI or execution request |
| File-based library/cache (no DB) | Zero infrastructure — code/instruction libraries are just `.py`/`.txt`/`.json` files on disk; simple to back up and migrate |
| Separate REFINE_MODEL and CODEGEN_MODEL | Allows tuning cost/quality trade-off independently per use case |
| Subprocess isolation for code execution | Crash/OOM/timeout in user code cannot affect the FastAPI process |
| Four-layer security model | Each layer catches what the previous one misses; removing any one weakens the system |
| SSE over WebSockets | Simpler protocol for unidirectional server→client streaming; no connection upgrade needed |
| Prompts in separate files | Prompts evolve independently of service logic; easier to A/B test and review |
| Pydantic schemas per domain | Single source of truth for request/response shape; auto-generates OpenAPI docs |
| `get_settings()` with lru_cache | Settings should be read once at startup, not on every request |
| `_resolve_env_files()` without Pydantic | Bootstrapping APP_ENV with Pydantic creates a circular dependency; manual byte-safe reading avoids it |
