# AI Code Builder

An enterprise-grade AI-powered tool that transforms natural language data instructions into executable Python code.

## Features

- **Upload** CSV or XLSX files (with optional metadata-only file support)
- **Write** step-by-step instructions in plain English
- **Refine** instructions into a structured AI prompt (Claude-powered, streaming)
- **Generate** Python transformation code (streaming into Monaco editor)
- **Edit** the generated code directly in the browser
- **Execute** code in a sandboxed environment using your uploaded data
- **Preview** output rows in-browser, then **download** the full CSV
- **Code Library** — save, share, and reuse generated code snippets (public/private)
- **Instructions Library** — save and reload reusable instruction templates
- **Code Cache** — auto-cache generated code per instruction label for instant recall
- **File Summary** — per-column statistics (nulls, uniques, min/max) on uploaded datasets

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + Shadcn/UI |
| Code Editor | Monaco Editor |
| State | Zustand + TanStack Query |
| Backend | FastAPI (Python 3.12) |
| AI | Anthropic Claude (configurable per-use-case model) |
| Data | pandas + openpyxl + pyarrow |
| Sandbox | AST validation + subprocess isolation |

## Quick Start

### Prerequisites
- Python 3.12+
- Node.js 20+
- An Anthropic API key

### Local Development (Recommended — management scripts)

```bash
cp backend/.env.example backend/.env.development
# Edit backend/.env.development and set ANTHROPIC_API_KEY=sk-ant-...
echo "APP_ENV=development" > backend/.env
```

**Windows (PowerShell):**
```powershell
scripts\start.bat          # start backend + frontend
scripts\stop.bat           # stop backend + frontend
scripts\start.bat --backend-only   # start backend only
scripts\stop.bat --backend-only    # stop backend only
scripts\start.bat --skip-deps      # skip pip/npm install (faster restart)
```

**macOS / Linux:**
```bash
scripts/start.sh           # start backend + frontend
scripts/stop.sh            # stop backend + frontend
```

Backend runs at http://localhost:8000. API docs at http://localhost:8000/docs.
Frontend dev server runs at http://127.0.0.1:5173 by default.

In local development, the frontend uses relative API paths by default and relies on
the Vite proxy (`/api` -> `http://127.0.0.1:8000`). This avoids browser "Network Error"
issues caused by `localhost` vs `127.0.0.1` origin mismatches.

### Local Development (Manual)

**Backend:**
```bash
cd backend
cp .env.example .env.development
# Edit .env.development and set ANTHROPIC_API_KEY=sk-ant-...
echo "APP_ENV=development" > .env
pip install poetry
poetry install
poetry run uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Docker (Production)

```bash
cp backend/.env.example backend/.env.development
# Set ANTHROPIC_API_KEY in backend/.env.development
echo "APP_ENV=production" > backend/.env

docker-compose up --build
```

App available at http://localhost:80.

### Docker (Development — hot reload)

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Configuration

All settings are environment-variable driven. See:
- [`backend/.env.example`](backend/.env.example) — backend config
- [`frontend/.env.example`](frontend/.env.example) — frontend config

Key settings:

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | required | Your Anthropic API key |
| `REFINE_MODEL` | `claude-haiku-4-5-20251001` | Model for instruction refinement |
| `CODEGEN_MODEL` | `claude-haiku-4-5-20251001` | Model for code generation |
| `SANDBOX_TIMEOUT_SECONDS` | `30` | Max execution time |
| `MAX_UPLOAD_SIZE_MB` | `50` | File size limit |
| `VITE_API_BASE_URL` | `` (empty) | Frontend API base URL; leave empty in dev to use the Vite proxy |
| `PREVIEW_ROW_COUNT` | `50` | Preview rows shown |
| `INBOUND_DIR` | `<tmpdir>/code_builder_inbound` | Uploaded files + parquet cache |
| `CODE_LIBRARY_DIR` | `<tmpdir>/code_builder_library` | Saved Python code snippets |
| `INSTRUCTIONS_LIBRARY_DIR` | `<tmpdir>/code_builder_instructions` | Saved instruction templates |
| `CODE_CACHE_DIR` | `<tmpdir>/code_builder_code_cache` | Instruction-label → code mappings |
| `TEMP_DIR` | `<tmpdir>/code_builder_sessions` | Ephemeral sandbox artifacts |

## Security

The code execution sandbox uses 4 isolation layers:
1. **Syntax check** — built-in `compile()` validates syntax before any execution
2. **AST validation** — blocks dangerous imports (`subprocess`, `sys`, `socket`, …) and builtins (`exec`, `eval`, `open`) before execution
3. **Subprocess isolation** — code runs in a child process with a stripped environment and restricted `__builtins__`
4. **Process timeout** — hard kill after `SANDBOX_TIMEOUT_SECONDS`

## Project Structure

```
ai-code-builder-V2/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/v1/         # Endpoints: upload, instructions, codegen, execution,
│   │   │                   #   code-library, instructions-library, code-cache
│   │   ├── config/         # Pydantic settings (layered .env loading)
│   │   ├── prompts/        # AI prompt templates
│   │   ├── sandbox/        # Code execution sandbox (AST + subprocess)
│   │   ├── services/       # Business logic (file, codegen, library, cache services)
│   │   ├── session/        # In-memory session store
│   │   ├── schemas/        # Pydantic request/response models
│   │   └── utils/          # Shared helpers (SSE, file utils, Anthropic client)
│   ├── .env                # APP_ENV selector only (gitignored)
│   ├── .env.development    # Full dev config incl. secrets (gitignored)
│   ├── .env.example        # Committed template — no secrets
│   └── tests/
├── frontend/                # React + TypeScript frontend
│   └── src/
│       ├── components/
│       │   ├── layout/     # AppHeader, WorkflowStepper, CodeLibraryPanel,
│       │   │               #   InstructionsLibraryPanel, FileSummaryModal
│       │   ├── upload/     # FileUploadZone, FileMetadataCard
│       │   ├── instructions/ # InstructionPanel, RawInstructionBox, RefinedPromptBox
│       │   ├── codegen/    # CodeGenPanel, MonacoCodeEditor
│       │   └── execution/  # ExecutionPanel, OutputPreviewTable
│       ├── hooks/          # useFileUpload, useInstructionRefine, useCodeGeneration,
│       │                   #   useCodeExecution, useAutoFix, useDownload
│       ├── store/          # Zustand: sessionStore, instructionStore, codeStore, executionStore
│       ├── services/       # Axios API client
│       ├── types/          # API DTOs (api.types.ts)
│       └── utils/          # SSE parser, formatters, toast helpers
├── scripts/                 # Service management
│   ├── start.bat / start.sh # Start backend + frontend
│   ├── stop.bat  / stop.sh  # Stop backend + frontend
│   ├── status.bat           # Show running services
│   ├── health.bat           # Check backend /health
│   └── manage.py            # Cross-platform management script
├── docker-compose.yml
└── .github/workflows/ci.yml
```
