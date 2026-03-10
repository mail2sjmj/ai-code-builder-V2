# Backend Agent Guide — AI Code Builder

> **Purpose:** Step-by-step instructions for a coding agent to recreate this FastAPI/Python
> backend from scratch. Follow every section in order. Do not skip steps.

---

## 1. Project Overview

This is a **FastAPI** application that powers a 5-step AI data-transformation workflow.
It receives file uploads, orchestrates AI calls to Anthropic Claude, and safely executes
AI-generated Python code in a restricted sandbox.

### API Surface

| Method | Path                                                      | Purpose                                          |
|--------|-----------------------------------------------------------|--------------------------------------------------|
| GET    | `/health`                                                 | Health check                                     |
| POST   | `/api/v1/upload`                                          | Upload CSV / XLSX file                           |
| POST   | `/api/v1/upload/metadata-preview`                         | Preview columns from a metadata-only file        |
| POST   | `/api/v1/upload/metadata-sample`                          | Generate synthetic CSV sample from metadata      |
| GET    | `/api/v1/session/{session_id}/summary`                    | Column-level statistics (nulls, uniques, min/max)|
| GET    | `/api/v1/session/{session_id}/column-values`              | Sample/unique values for a column                |
| POST   | `/api/v1/instructions/refine`                             | Refine raw instructions (SSE)                    |
| POST   | `/api/v1/codegen/generate`                                | Generate Python code (SSE)                       |
| POST   | `/api/v1/codegen/fix`                                     | Auto-fix broken code (SSE)                       |
| POST   | `/api/v1/execute`                                         | Submit code execution job                        |
| GET    | `/api/v1/execute/{session_id}/{job_id}`                   | Poll job status                                  |
| GET    | `/api/v1/execute/{session_id}/{job_id}/output`            | Download result CSV                              |
| POST   | `/api/v1/code-library/save`                               | Save Python code snippet (public or private)     |
| GET    | `/api/v1/code-library/{visibility}`                       | List saved code files                            |
| GET    | `/api/v1/code-library/{visibility}/{filename}/content`    | Retrieve content of a saved code file            |
| POST   | `/api/v1/code-library/private/{filename}/share-public`    | Copy private file to public library              |
| POST   | `/api/v1/code-library/private/{filename}/share-users`     | Share private file with specific user IDs        |
| DELETE | `/api/v1/code-library/{visibility}/{filename}`            | Delete a saved code file                         |
| POST   | `/api/v1/instructions-library/save`                       | Save an instruction template                     |
| GET    | `/api/v1/instructions-library/list`                       | List all saved instruction templates             |
| GET    | `/api/v1/instructions-library/{filename}`                 | Retrieve instruction text                        |
| DELETE | `/api/v1/instructions-library/{filename}`                 | Delete an instruction template                   |
| POST   | `/api/v1/code-cache/save`                                 | Save instruction-label → code mapping            |
| GET    | `/api/v1/code-cache/{label}`                              | Retrieve cached code for a label                 |

### Technology Choices

| Concern           | Library                                    |
|-------------------|--------------------------------------------|
| Web framework     | FastAPI >= 0.115                           |
| ASGI server       | Uvicorn >= 0.30                            |
| AI provider       | Anthropic Python SDK >= 0.34               |
| Data processing   | Pandas >= 2.2, PyArrow >= 16, openpyxl >= 3.1 |
| Sandboxed execution | Subprocess + RestrictedPython >= 7.1    |
| Configuration     | Pydantic Settings >= 2.4                   |
| File type detection | python-magic (Unix) / python-magic-bin (Windows) |
| Async file I/O    | aiofiles >= 23                             |

---

## 2. Prerequisites

- Python >= 3.12
- pip or Poetry
- An Anthropic API key (`ANTHROPIC_API_KEY`)
- libmagic installed on the system:
  - **Ubuntu/Debian:** `apt-get install libmagic1`
  - **macOS:**         `brew install libmagic`
  - **Windows:**       use `python-magic-bin` instead of `python-magic`

---

## 3. Project Scaffold

```
ai-code-builder/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── dependencies.py
│   │   │   └── v1/
│   │   │       ├── __init__.py
│   │   │       ├── router.py
│   │   │       ├── upload.py
│   │   │       ├── instructions.py
│   │   │       ├── codegen.py
│   │   │       ├── execution.py
│   │   │       ├── code_library.py
│   │   │       ├── instructions_library.py
│   │   │       └── code_cache.py
│   │   ├── config/
│   │   │   ├── __init__.py
│   │   │   └── settings.py
│   │   ├── prompts/
│   │   │   ├── __init__.py
│   │   │   ├── codegen_prompt.py
│   │   │   └── refinement_prompt.py
│   │   ├── sandbox/
│   │   │   ├── __init__.py
│   │   │   ├── policy.py
│   │   │   ├── runner.py
│   │   │   └── validator.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── upload.py
│   │   │   ├── instruction.py
│   │   │   ├── codegen.py
│   │   │   ├── execution.py
│   │   │   ├── code_library.py
│   │   │   ├── instructions_library.py
│   │   │   └── code_cache.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── codegen_service.py
│   │   │   ├── execution_service.py
│   │   │   ├── file_service.py
│   │   │   ├── instruction_service.py
│   │   │   ├── code_library_service.py
│   │   │   ├── instructions_library_service.py
│   │   │   └── code_cache_service.py
│   │   ├── session/
│   │   │   ├── __init__.py
│   │   │   └── session_store.py
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── file_utils.py
│   │       ├── streaming.py
│   │       └── anthropic_client.py
│   ├── .env                    # APP_ENV selector only (gitignored)
│   ├── .env.development        # full dev config incl. secrets (gitignored)
│   ├── .env.staging            # full staging config (gitignored)
│   ├── .env.production         # full production config (gitignored)
│   ├── .env.example            # committed template — no secrets
│   ├── requirements.txt
│   └── AGENT_GUIDE.md
├── frontend/                   # React/Vite app — see frontend/AGENT_GUIDE.md
└── scripts/
    ├── manage.py               # cross-platform service management (Python)
    ├── start.bat  / start.sh   # thin wrappers → manage.py start
    ├── stop.bat   / stop.sh    # thin wrappers → manage.py stop
    ├── health.bat / health.sh  # thin wrappers → manage.py health
    └── status.bat / status.sh  # thin wrappers → manage.py status
```

Create all directories and empty `__init__.py` files before writing any logic.

---

## 4. Dependencies

### Using `pyproject.toml` (Poetry)

```toml
[tool.poetry.dependencies]
python             = "^3.12"
fastapi            = ">=0.115.0"
uvicorn            = {extras = ["standard"], version = ">=0.30.0"}
python-multipart   = ">=0.0.9"
anthropic          = ">=0.34.0"
pandas             = ">=2.2.0"
openpyxl           = ">=3.1.0"
pyarrow            = ">=16.0.0"
RestrictedPython   = ">=7.1"
pydantic-settings  = ">=2.4.0"
python-dotenv      = ">=1.0.0"
aiofiles           = ">=23.0.0"
# platform-specific — choose ONE:
# python-magic-bin  = ">=0.4.14"   # Windows
# python-magic      = ">=0.4.27"   # Unix/macOS
```

### Using `requirements.txt`

```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
python-multipart>=0.0.9
anthropic>=0.34.0
pandas>=2.2.0
openpyxl>=3.1.0
pyarrow>=16.0.0
RestrictedPython>=7.1
pydantic-settings>=2.4.0
python-dotenv>=1.0.0
aiofiles>=23.0.0
python-magic-bin>=0.4.14   # Windows
# python-magic>=0.4.27     # Unix/macOS
```

---

## 5. Environment Variables — layered config

Config is loaded in priority order (later = wins):

```
1. Built-in field defaults         (settings.py)
2. backend/.env                    APP_ENV selector only  (gitignored)
3. backend/.env.<APP_ENV>          full environment config (gitignored)
4. backend/.env.<APP_ENV>.local    personal local tweaks   (gitignored)
5. OS environment variables                                (always win)
```

`backend/.env` contains only:
```env
APP_ENV=development   # development | staging | production
```

`backend/.env.<APP_ENV>` is the fully self-contained config (copy from `.env.example`):

```env
# ── Application ───────────────────────────────────────────────────────────────
APP_ENV=development
APP_VERSION=1.0.0
API_PREFIX=/api/v1
ALLOWED_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173","http://localhost:3000","http://localhost:80","http://127.0.0.1:80"]

# ── File Upload ───────────────────────────────────────────────────────────────
MAX_UPLOAD_SIZE_MB=50
ALLOWED_EXTENSIONS=[".csv",".xlsx"]
METADATA_SAMPLE_DEFAULT_ROWS=100
METADATA_SAMPLE_MAX_ROWS=5000

# ── Storage Directories ───────────────────────────────────────────────────────
# All dirs auto-resolve via tempfile.gettempdir() if left unset.
# In staging/production set these to persistent, backed-up volumes.
#
# INBOUND_DIR   — uploaded files + parquet caches (long-lived, per-session)
# INBOUND_DIR=
# CODE_LIBRARY_DIR  — saved Python code snippets (.py files, public + private)
# CODE_LIBRARY_DIR=
# INSTRUCTIONS_LIBRARY_DIR  — saved instruction prompts (.txt files)
# INSTRUCTIONS_LIBRARY_DIR=
# CODE_CACHE_DIR  — instruction-label → code mappings (.json files)
# CODE_CACHE_DIR=
# TEMP_DIR  — ephemeral sandbox artifacts (wrapper scripts, output CSVs)
# TEMP_DIR=

SESSION_TTL_SECONDS=3600

# ── Sandbox Execution ─────────────────────────────────────────────────────────
SANDBOX_TIMEOUT_SECONDS=30
SANDBOX_MAX_MEMORY_MB=512
SANDBOX_MAX_OUTPUT_ROWS=100000
PREVIEW_ROW_COUNT=50

# ── Logging ───────────────────────────────────────────────────────────────────
# LOG_DIR defaults to <tempdir>/code_builder_logs if unset.
# LOG_DIR=
LOG_LEVEL=INFO                  # DEBUG | INFO | WARNING | ERROR | CRITICAL
LOG_MAX_BYTES=10485760          # 10 MB per file
LOG_BACKUP_COUNT=5

# ── Anthropic AI — REQUIRED ───────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6       # legacy fallback; prefer REFINE_MODEL / CODEGEN_MODEL
REFINE_MODEL=claude-haiku-4-5-20251001  # fast model for prompt expansion
CODEGEN_MODEL=claude-haiku-4-5-20251001 # fast model for code generation
REFINE_MAX_TOKENS=1024
CODEGEN_MAX_TOKENS=8192
CODEGEN_SAMPLE_ROWS=10
AI_TEMPERATURE=0.2
AI_REQUEST_TIMEOUT_SECONDS=120
AI_MAX_RETRIES=5
```

All `.env*` files except `.env.example` are gitignored — they contain secrets.

---

## 6. Configuration — `app/config/settings.py`

Use Pydantic Settings so every value can be overridden by an environment variable or a
`.env` file. No magic numbers elsewhere in the codebase.

Key design points:
- `INBOUND_DIR` (uploaded files, session-lifetime) is **separate** from `TEMP_DIR` (ephemeral sandbox artifacts) so they can live on different storage volumes.
- All directory defaults use `tempfile.gettempdir()` via `default_factory` — never hardcode `/tmp`.
- `_resolve_env_files()` performs a byte-safe two-pass bootstrap to support layered env files.
- `get_settings()` is `@lru_cache` — one singleton per process.

```python
import logging
import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8-sig",   # handles UTF-8 with or without BOM
        case_sensitive=True,
        extra="ignore",
    )

    # ── Application ───────────────────────────────────────────────────────
    APP_ENV: Literal["development", "staging", "production"] = "development"
    APP_VERSION: str = "1.0.0"
    API_PREFIX:  str = "/api/v1"
    ALLOWED_ORIGINS: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:80"]
    )

    # ── File Upload ───────────────────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB:            int       = Field(default=50,    ge=1, le=500)
    ALLOWED_EXTENSIONS:            list[str] = Field(default=[".csv", ".xlsx"])
    METADATA_SAMPLE_DEFAULT_ROWS:  int       = Field(default=100,   ge=1, le=100_000)
    METADATA_SAMPLE_MAX_ROWS:      int       = Field(default=5_000, ge=1, le=1_000_000)

    # INBOUND_DIR: where uploaded files (original + parquet cache) live.
    # Use a persistent, backed-up volume in staging/production.
    INBOUND_DIR: str = Field(
        default_factory=lambda: str(Path(tempfile.gettempdir()) / "code_builder_inbound")
    )
    CODE_LIBRARY_DIR: str = Field(
        default_factory=lambda: str(Path(tempfile.gettempdir()) / "code_builder_library")
    )
    INSTRUCTIONS_LIBRARY_DIR: str = Field(
        default_factory=lambda: str(Path(tempfile.gettempdir()) / "code_builder_instructions")
    )
    CODE_CACHE_DIR: str = Field(
        default_factory=lambda: str(Path(tempfile.gettempdir()) / "code_builder_code_cache")
    )
    SESSION_TTL_SECONDS: int = Field(default=3600, ge=60)

    # ── Sandbox Execution ─────────────────────────────────────────────────
    # TEMP_DIR: ephemeral per-execution artifacts (wrapper scripts, output CSVs).
    TEMP_DIR: str = Field(
        default_factory=lambda: str(Path(tempfile.gettempdir()) / "code_builder_sessions")
    )
    SANDBOX_TIMEOUT_SECONDS:  int = Field(default=30,      ge=5,   le=300)
    SANDBOX_MAX_MEMORY_MB:    int = Field(default=512,     ge=64,  le=4096)
    SANDBOX_MAX_OUTPUT_ROWS:  int = Field(default=100_000, ge=100)
    PREVIEW_ROW_COUNT:        int = Field(default=50,      ge=5,   le=500)

    # ── Logging ───────────────────────────────────────────────────────────
    LOG_DIR: str = Field(
        default_factory=lambda: str(Path(tempfile.gettempdir()) / "code_builder_logs")
    )
    LOG_LEVEL:        Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    LOG_MAX_BYTES:    int = Field(default=10 * 1024 * 1024, ge=1024 * 1024)
    LOG_BACKUP_COUNT: int = Field(default=5, ge=0, le=20)

    # ── Anthropic AI ──────────────────────────────────────────────────────
    ANTHROPIC_API_KEY:          str   = Field(default="")
    ANTHROPIC_MODEL:            str   = "claude-sonnet-4-6"   # legacy fallback
    REFINE_MODEL:               str   = Field(default="claude-haiku-4-5-20251001")
    CODEGEN_MODEL:              str   = Field(default="claude-haiku-4-5-20251001")
    REFINE_MAX_TOKENS:          int   = Field(default=1024,  ge=256,  le=4096)
    CODEGEN_MAX_TOKENS:         int   = Field(default=8192,  ge=1024, le=32768)
    CODEGEN_SAMPLE_ROWS:        int   = Field(default=10,    ge=1,    le=100)
    AI_TEMPERATURE:             float = Field(default=0.2,   ge=0.0,  le=1.0)
    AI_REQUEST_TIMEOUT_SECONDS: int   = Field(default=120,   ge=10,   le=600)
    AI_MAX_RETRIES:             int   = Field(default=5,     ge=0,    le=10)

    @field_validator("ALLOWED_EXTENSIONS", "ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _parse_json_list(cls, v: object) -> list:
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v  # type: ignore[return-value]

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"


def _read_env_file_text(path: Path) -> str:
    """Read an env file as text using a BOM-aware encoding fallback chain."""
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, ValueError):
            continue
    return ""


def _resolve_env_files() -> tuple[str, ...]:
    """
    Discover APP_ENV without instantiating Settings (avoids chicken-and-egg).
    Priority: OS env-var → .env file → "development".
    Returns the ordered list of env files for the full Settings load.
    """
    app_env = os.environ.get("APP_ENV", "").strip()

    if not app_env:
        env_path = Path(".env")
        if env_path.exists():
            for line in _read_env_file_text(env_path).splitlines():
                line = line.strip()
                if line.startswith("APP_ENV=") and not line.startswith("#"):
                    app_env = line.split("=", 1)[1].strip().split("#")[0].strip()
                    break

    if not app_env:
        app_env = "development"

    files: list[str] = [".env"]
    for suffix in (f".env.{app_env}", f".env.{app_env}.local"):
        if Path(suffix).exists():
            files.append(suffix)
    return tuple(files)


@lru_cache
def get_settings() -> Settings:
    env_files = _resolve_env_files()
    settings = Settings(_env_file=env_files)  # type: ignore[call-arg]
    logger.info(
        "Settings loaded: env=%s files=%s model=%s",
        settings.APP_ENV, env_files, settings.ANTHROPIC_MODEL,
    )
    return settings
```

---

## 7. Session Management — `app/session/session_store.py`

This is the **in-memory database** for the application. It must be thread-safe because
FastAPI runs request handlers concurrently.

```python
from __future__ import annotations
import asyncio
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from app.config.settings import settings


JobStatus = Literal["queued", "running", "success", "error"]


@dataclass
class ExecutionJob:
    job_id:           str
    status:           JobStatus        = "queued"
    created_at:       float            = field(default_factory=time.time)
    started_at:       float | None     = None
    finished_at:      float | None     = None
    preview_rows:     list[dict]       = field(default_factory=list)
    preview_columns:  list[str]        = field(default_factory=list)
    error_message:    str | None       = None
    execution_time_ms: int | None      = None
    output_csv_path:  Path | None      = None


@dataclass
class SessionData:
    session_id:   str
    created_at:   float            = field(default_factory=time.time)
    file_path:    Path | None      = None
    parquet_path: Path | None      = None
    filename:     str              = ""
    row_count:    int              = 0
    column_count: int              = 0
    columns:      list[str]        = field(default_factory=list)
    dtypes:       dict[str, str]   = field(default_factory=dict)
    execution_jobs: dict[str, ExecutionJob] = field(default_factory=dict)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionData] = {}
        self._lock = asyncio.Lock()

    async def create(self) -> SessionData:
        session = SessionData(session_id=str(uuid.uuid4()))
        async with self._lock:
            self._sessions[session.session_id] = session
        return session

    async def get(self, session_id: str) -> SessionData | None:
        async with self._lock:
            return self._sessions.get(session_id)

    async def get_or_404(self, session_id: str) -> SessionData:
        from fastapi import HTTPException
        session = await self.get(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return session

    async def update(self, session: SessionData) -> None:
        async with self._lock:
            self._sessions[session.session_id] = session

    async def add_job(self, session_id: str, job: ExecutionJob) -> None:
        async with self._lock:
            if session_id in self._sessions:
                self._sessions[session_id].execution_jobs[job.job_id] = job

    async def get_job(self, session_id: str, job_id: str) -> ExecutionJob | None:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session:
                return session.execution_jobs.get(job_id)
        return None

    async def cleanup_expired(self) -> int:
        cutoff = time.time() - settings.SESSION_TTL_SECONDS
        removed = 0
        async with self._lock:
            expired = [sid for sid, s in self._sessions.items() if s.created_at < cutoff]
            for sid in expired:
                del self._sessions[sid]
                removed += 1
        return removed


# Singleton shared across the entire application lifetime
session_store = SessionStore()
```

---

## 8. Pydantic Schemas — `app/schemas/`

Each schema file mirrors the corresponding API request/response contract.

### `app/schemas/upload.py`

```python
from pydantic import BaseModel


class UploadResponse(BaseModel):
    session_id:       str
    filename:         str
    row_count:        int
    column_count:     int
    columns:          list[str]
    dtypes:           dict[str, str]
    file_size_bytes:  int
```

### `app/schemas/instruction.py`

```python
from pydantic import BaseModel, Field


class RefineRequest(BaseModel):
    session_id:        str
    raw_instructions:  str = Field(min_length=10, max_length=5_000)
```

### `app/schemas/codegen.py`

```python
from pydantic import BaseModel, Field


class CodeGenRequest(BaseModel):
    session_id:     str
    refined_prompt: str = Field(min_length=50, max_length=20_000)


class CodeFixRequest(BaseModel):
    session_id:    str
    broken_code:   str = Field(min_length=10, max_length=100_000)
    error_message: str = Field(min_length=1,  max_length=5_000)
```

### `app/schemas/execution.py`

```python
from typing import Literal
from pydantic import BaseModel, Field


class ExecuteRequest(BaseModel):
    session_id: str
    code:       str = Field(min_length=10, max_length=50_000)


class ExecutionResult(BaseModel):
    job_id:            str
    status:            Literal["queued", "running", "success", "error"]
    preview_rows:      list[dict]    = []
    preview_columns:   list[str]     = []
    error_message:     str | None    = None
    execution_time_ms: int | None    = None
```

### `app/schemas/code_library.py`

```python
from typing import Literal
from pydantic import BaseModel

Visibility = Literal["public", "private"]

class SaveCodeRequest(BaseModel):
    code:       str
    label:      str
    visibility: Visibility = "private"
    overwrite:  bool       = False

class SaveCodeResponse(BaseModel):
    saved_in:  str
    filenames: list[str]

class CodeLibraryItem(BaseModel):
    filename:   str
    label:      str
    visibility: Visibility

class CodeLibraryListResponse(BaseModel):
    visibility: str
    items:      list[CodeLibraryItem]

class CodeContentResponse(BaseModel):
    filename:   str
    visibility: str
    code:       str

class ShareToPublicResponse(BaseModel):
    filename: str
    message:  str

class ShareToUsersRequest(BaseModel):
    user_ids: list[str]

class ShareToUsersResponse(BaseModel):
    filename:  str
    shared_to: list[str]
```

### `app/schemas/instructions_library.py`

```python
from pydantic import BaseModel

class SaveInstructionRequest(BaseModel):
    instruction: str
    label:       str
    overwrite:   bool = False

class SaveInstructionResponse(BaseModel):
    filename: str

class InstructionLibraryItem(BaseModel):
    filename: str
    label:    str

class InstructionLibraryListResponse(BaseModel):
    items: list[InstructionLibraryItem]
```

### `app/schemas/code_cache.py`

```python
from pydantic import BaseModel

class SaveCodeCacheRequest(BaseModel):
    label:            str
    code:             str
    raw_instructions: str
    refined_prompt:   str

class SaveCodeCacheResponse(BaseModel):
    label: str

class CodeCacheEntry(BaseModel):
    label:            str
    code:             str
    raw_instructions: str
    refined_prompt:   str
```

### `app/schemas/upload.py` (extended)

```python
# Additional schemas added beyond the base UploadResponse

class ColumnSummary(BaseModel):
    column:           str
    dtype:            str
    record_count:     int
    null_count:       int
    count_with_values: int
    unique_count:     int
    is_key_column:    str   # "Yes" | "No"
    min_value:        str | None
    max_value:        str | None

class FileSummaryResponse(BaseModel):
    session_id: str
    filename:   str
    columns:    list[ColumnSummary]

class ColumnValuesResponse(BaseModel):
    column:    str
    values:    list[str]
    is_sample: bool   # True if unique count > 20 (random sample returned)

class MetadataPreviewResponse(BaseModel):
    filename:        str
    column_count:    int
    columns:         list[str]
    dtypes:          dict[str, str]
    file_size_bytes: int
```

---

## 9. Library & Cache Services

### `app/services/code_library_service.py`

File-based code library. Stores `.py` files in `CODE_LIBRARY_DIR/public/` and
`CODE_LIBRARY_DIR/private/`. Filenames are derived from the label (slug-safe).
Sharing copies the file to the target location.

Key functions:
- `save_code_to_library(code, label, visibility, settings, overwrite)` → `(saved_in, filenames)`
- `list_library_codes(visibility, settings)` → list of `{filename, label, visibility}`
- `get_code_content(visibility, filename, settings)` → `str | None`
- `share_code_to_public(filename, settings)` → copies `private/` → `public/`
- `share_code_to_users(filename, user_ids, settings)` → copies to user-namespaced dirs
- `delete_code_from_library(visibility, filename, settings)`

### `app/services/instructions_library_service.py`

File-based instruction library. Stores `.txt` files in `INSTRUCTIONS_LIBRARY_DIR/`.

Key functions:
- `save_instruction_to_library(instruction, label, settings, overwrite)` → `filename`
- `list_library_instructions(settings)` → list of `{filename, label}`
- `get_instruction_text(filename, settings)` → `str`
- `delete_instruction_from_library(filename, settings)`

### `app/services/code_cache_service.py`

Maps instruction labels → generated code + prompts as `.json` files in `CODE_CACHE_DIR/`.

Key functions:
- `save_code_cache(label, code, raw_instructions, refined_prompt, settings)` → `label`
- `get_code_cache(label, settings)` → `CodeCacheEntry | None`

---

## 10. Utility Modules — `app/utils/`

### `app/utils/streaming.py`

Every SSE endpoint yields JSON events through this helper. The frontend's
`parseSSEStream` reads these events.

```python
from __future__ import annotations
import json
from collections.abc import AsyncIterator
from typing import Any


async def sse_event_generator(
    stream: AsyncIterator[str],
) -> AsyncIterator[str]:
    """
    Wraps an async string iterator into SSE-formatted events.

    Each event is a JSON object:
      { "chunk": "<text>", "done": false }   — while streaming
      { "done": true }                        — final event
      { "error": "<message>", "done": true }  — on error
    """
    try:
        async for chunk in stream:
            payload = json.dumps({"chunk": chunk, "done": False})
            yield f"data: {payload}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"
    except Exception as exc:
        payload = json.dumps({"error": str(exc), "done": True})
        yield f"data: {payload}\n\n"


def make_sse_chunk(data: Any) -> str:
    return f"data: {json.dumps(data)}\n\n"
```

### `app/utils/file_utils.py`

```python
from pathlib import Path


ALLOWED_MAGIC_BYTES = {
    b"\x50\x4b\x03\x04",  # XLSX (ZIP-based)
}

CSV_SIGNATURES = {b"\xef\xbb\xbf", b"\x22", b"\x2c"}  # BOM, quote, comma


def detect_file_type(path: Path) -> str:
    """Return 'csv' or 'xlsx' based on magic bytes. Raises ValueError if unknown."""
    with open(path, "rb") as fh:
        header = fh.read(8)

    if header[:4] in ALLOWED_MAGIC_BYTES:
        return "xlsx"

    # CSV: try to read a small portion and check it's text
    try:
        path.read_text(encoding="utf-8", errors="strict")
        return "csv"
    except UnicodeDecodeError:
        pass

    raise ValueError("Unrecognised file format — only CSV and XLSX are supported.")
```

---

## 10. Prompts — `app/prompts/`

### `app/prompts/codegen_prompt.py`

The system prompt is the most critical file for code quality and safety. Every rule
here is enforced by the sandbox validator as well.

```python
SYSTEM_PROMPT = """\
You are a senior Python data-engineering assistant.
Your task is to write a self-contained Python script that transforms tabular data.

## Rules

### I/O — mandatory
- Load input:  df = pd.read_parquet(os.environ["INPUT_FILE_PATH"])
- Save output: df_output.to_csv(os.environ["OUTPUT_FILE_PATH"], index=False)
- The variable `df_output` MUST be a pandas DataFrame.

### Code structure
- Wrap all logic inside a function called `main()`.
- Call `main()` at the end of the script.
- Do NOT use if __name__ == "__main__" guards.

### Allowed imports (whitelist)
pandas, numpy, os, pathlib, re, datetime, math, json, csv,
collections, functools, itertools, typing

### Forbidden (will cause execution failure)
subprocess, socket, requests, urllib, httpx, importlib, ctypes, sys,
shutil, tempfile, pickle, eval, exec, __import__, open (use os.environ paths only)

### Output format
- Return ONLY raw Python code.
- Do NOT wrap in markdown code fences (no ```python).
- Do NOT include explanatory comments outside the code.
"""


def build_user_prompt(
    refined_prompt: str,
    columns: list[str],
    dtypes: dict[str, str],
    sample_rows: list[dict],
) -> str:
    col_info = "\n".join(f"  - {c}: {dtypes.get(c, 'unknown')}" for c in columns)
    sample   = "\n".join(str(r) for r in sample_rows[:3])
    return (
        f"## Task\n{refined_prompt}\n\n"
        f"## Dataset schema\n{col_info}\n\n"
        f"## Sample rows (first 3)\n{sample}\n\n"
        "Write the Python transformation script now."
    )
```

### `app/prompts/refinement_prompt.py`

```python
SYSTEM_PROMPT = """\
You are a data-transformation requirements analyst.
Given a user's rough description of what they want to do with a CSV/Excel dataset,
rewrite it as a precise, structured prompt that a code-generation AI can use directly.

## Output format
Return a structured prompt with these sections (use markdown headers):
1. **Objective** — one clear sentence
2. **Input columns** — list the columns the user mentioned or implied
3. **Transformation steps** — numbered, unambiguous list of every operation
4. **Output columns** — what the final DataFrame should contain
5. **Edge cases** — null handling, type coercion, duplicates, etc.

Keep the language technical but concise. Do not add waffle or filler.
Do NOT wrap output in code fences.
"""


def build_user_prompt(raw_instructions: str, columns: list[str]) -> str:
    col_list = ", ".join(columns[:20])
    if len(columns) > 20:
        col_list += f" … (+{len(columns) - 20} more)"
    return (
        f"Available columns: {col_list}\n\n"
        f"User's raw instructions:\n{raw_instructions}"
    )
```

---

## 11. Sandbox — `app/sandbox/`

### `app/sandbox/validator.py`

Validate the AST before ever running the code. Reject anything that imports
forbidden modules.

```python
import ast
from typing import Final

FORBIDDEN_IMPORTS: Final = frozenset({
    "subprocess", "socket", "requests", "urllib", "httpx",
    "importlib", "ctypes", "sys", "shutil", "tempfile", "pickle",
    "multiprocessing", "threading", "signal", "os.system",
})


class SecurityValidator(ast.NodeVisitor):
    def __init__(self) -> None:
        self.violations: list[str] = []

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            if alias.name.split(".")[0] in FORBIDDEN_IMPORTS:
                self.violations.append(f"Forbidden import: {alias.name}")
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        mod = (node.module or "").split(".")[0]
        if mod in FORBIDDEN_IMPORTS:
            self.violations.append(f"Forbidden import: {node.module}")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        # Block eval() and exec()
        if isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec"}:
            self.violations.append(f"Forbidden call: {node.func.id}()")
        self.generic_visit(node)


def validate_code(source: str) -> list[str]:
    """Return a list of violation strings. Empty list = code is safe."""
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return [f"SyntaxError: {exc}"]
    v = SecurityValidator()
    v.visit(tree)
    return v.violations
```

### `app/sandbox/runner.py`

Execute code in a subprocess so any crash or infinite loop cannot affect the main
FastAPI process.

```python
from __future__ import annotations
import asyncio
import os
import textwrap
from pathlib import Path

from app.config.settings import settings


# Wrapper injected around user code to restrict the builtins available at runtime
_WRAPPER_TEMPLATE = textwrap.dedent("""\
    import builtins as _builtins

    _SAFE_BUILTINS = {{
        k: getattr(_builtins, k)
        for k in (
            "None", "True", "False", "abs", "all", "any", "bool", "bytes",
            "chr", "dict", "dir", "divmod", "enumerate", "filter", "float",
            "format", "frozenset", "getattr", "hasattr", "hash", "hex",
            "id", "int", "isinstance", "issubclass", "iter", "len", "list",
            "map", "max", "min", "next", "object", "oct", "ord", "pow",
            "print", "range", "repr", "reversed", "round", "set", "setattr",
            "slice", "sorted", "str", "sum", "super", "tuple", "type", "vars",
            "zip",
        )
    }}
    _SAFE_BUILTINS["__import__"] = __import__

    _user_globals = {{"__builtins__": _SAFE_BUILTINS}}
    _user_code = open({code_path!r}).read()
    exec(compile(_user_code, {code_path!r}, "exec"), _user_globals)
    _user_globals["main"]()
""")


async def run_in_sandbox(
    code: str,
    input_parquet: Path,
    output_csv: Path,
    work_dir: Path,
) -> tuple[int, str, str]:
    """
    Write `code` to a temp file and execute it inside a subprocess.

    Returns (exit_code, stdout, stderr).
    """
    work_dir.mkdir(parents=True, exist_ok=True)
    code_path    = work_dir / "transform.py"
    wrapper_path = work_dir / "_runner.py"

    code_path.write_text(code, encoding="utf-8")
    wrapper_path.write_text(
        _WRAPPER_TEMPLATE.format(code_path=str(code_path)),
        encoding="utf-8",
    )

    env = {
        **os.environ,
        "INPUT_FILE_PATH":  str(input_parquet),
        "OUTPUT_FILE_PATH": str(output_csv),
        # Strip network-related env vars for extra isolation
        "http_proxy": "", "https_proxy": "", "HTTP_PROXY": "", "HTTPS_PROXY": "",
    }

    proc = await asyncio.create_subprocess_exec(
        "python", str(wrapper_path),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(work_dir),
    )

    try:
        stdout_b, stderr_b = await asyncio.wait_for(
            proc.communicate(),
            timeout=settings.SANDBOX_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        proc.kill()
        return 1, "", f"Execution timed out after {settings.SANDBOX_TIMEOUT_SECONDS}s"

    return (
        proc.returncode or 0,
        stdout_b.decode("utf-8", errors="replace"),
        stderr_b.decode("utf-8", errors="replace"),
    )
```

---

## 12. Services — `app/services/`

### `app/services/file_service.py`

```python
from __future__ import annotations
import uuid
from pathlib import Path

import aiofiles
import pandas as pd

from app.config.settings import settings
from app.session.session_store import SessionData, session_store
from app.utils.file_utils import detect_file_type


async def save_and_parse_file(
    filename: str,
    content: bytes,
) -> SessionData:
    """Persist the upload, parse it, and create a session."""
    session = await session_store.create()
    # INBOUND_DIR holds uploaded files; TEMP_DIR is for ephemeral sandbox artifacts.
    session_dir = Path(settings.INBOUND_DIR) / session.session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    # Write raw file
    raw_path = session_dir / filename
    async with aiofiles.open(raw_path, "wb") as fh:
        await fh.write(content)

    # Detect format and read
    file_type = detect_file_type(raw_path)
    df = pd.read_csv(raw_path) if file_type == "csv" else pd.read_excel(raw_path)

    # Cache as Parquet for fast re-reads
    parquet_path = session_dir / "data.parquet"
    df.to_parquet(parquet_path, index=False)

    # Populate session metadata
    session.file_path    = raw_path
    session.parquet_path = parquet_path
    session.filename     = filename
    session.row_count    = len(df)
    session.column_count = len(df.columns)
    session.columns      = list(df.columns)
    session.dtypes       = {c: str(t) for c, t in df.dtypes.items()}

    await session_store.update(session)
    return session
```

### `app/services/instruction_service.py`

```python
from __future__ import annotations
from collections.abc import AsyncIterator

import anthropic

from app.config.settings import settings
from app.prompts.refinement_prompt import SYSTEM_PROMPT, build_user_prompt
from app.session.session_store import SessionData

_client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def stream_refined_instructions(
    session: SessionData,
    raw_instructions: str,
) -> AsyncIterator[str]:
    user_prompt = build_user_prompt(raw_instructions, session.columns)

    async with _client.messages.stream(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=settings.REFINE_MAX_TOKENS,
        temperature=settings.AI_TEMPERATURE,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
```

### `app/services/codegen_service.py`

```python
from __future__ import annotations
import re
from collections.abc import AsyncIterator

import anthropic
import pandas as pd

from app.config.settings import settings
from app.prompts.codegen_prompt import SYSTEM_PROMPT, build_user_prompt
from app.session.session_store import SessionData

_client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

# Strip ```python ... ``` fences the model sometimes outputs despite instructions
_FENCE_RE = re.compile(r"^```(?:python)?\n?|```$", re.MULTILINE)


def _strip_fences(text: str) -> str:
    return _FENCE_RE.sub("", text).strip()


async def stream_generated_code(
    session: SessionData,
    refined_prompt: str,
) -> AsyncIterator[str]:
    # Load a small sample from the Parquet for context
    df_sample = pd.read_parquet(session.parquet_path).head(3)
    sample_rows = df_sample.to_dict(orient="records")

    user_prompt = build_user_prompt(
        refined_prompt, session.columns, session.dtypes, sample_rows
    )

    buffer = ""
    async with _client.messages.stream(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=settings.CODEGEN_MAX_TOKENS,
        temperature=settings.AI_TEMPERATURE,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    ) as stream:
        async for chunk in stream.text_stream:
            buffer += chunk
            # Strip fences lazily from the accumulated buffer
            clean = _strip_fences(buffer)
            delta = clean[len(_strip_fences(buffer[:-len(chunk)])):]
            if delta:
                yield delta


async def stream_fixed_code(
    session: SessionData,
    broken_code: str,
    error_message: str,
) -> AsyncIterator[str]:
    fix_prompt = (
        f"The following Python code failed with this error:\n\n"
        f"```\n{error_message}\n```\n\n"
        f"Fix the code so it runs correctly.\n\n"
        f"Broken code:\n```python\n{broken_code}\n```\n\n"
        f"Return ONLY the corrected Python code, no markdown fences."
    )

    async with _client.messages.stream(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=settings.CODEGEN_MAX_TOKENS,
        temperature=settings.AI_TEMPERATURE,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": fix_prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield text
```

### `app/services/execution_service.py`

```python
from __future__ import annotations
import asyncio
import time
import uuid
from pathlib import Path

import pandas as pd

from app.config.settings import settings
from app.sandbox.runner import run_in_sandbox
from app.sandbox.validator import validate_code
from app.session.session_store import ExecutionJob, SessionData, session_store


async def submit_execution(session: SessionData, code: str) -> str:
    """Validate code, create a job record, and fire-and-forget the execution."""
    violations = validate_code(code)
    if violations:
        raise ValueError("Code failed security validation: " + "; ".join(violations))

    job = ExecutionJob(job_id=str(uuid.uuid4()))
    await session_store.add_job(session.session_id, job)

    # Run asynchronously without blocking the HTTP response
    asyncio.create_task(_run_job(session, job, code))
    return job.job_id


async def _run_job(session: SessionData, job: ExecutionJob, code: str) -> None:
    job.status     = "running"
    job.started_at = time.time()

    # TEMP_DIR for sandbox artifacts; INBOUND_DIR (where parquet lives) stays separate.
    work_dir    = Path(settings.TEMP_DIR) / session.session_id / "jobs" / job.job_id
    output_path = work_dir / "output.csv"

    exit_code, _stdout, stderr = await run_in_sandbox(
        code=code,
        input_parquet=session.parquet_path,
        output_csv=output_path,
        work_dir=work_dir,
    )

    job.finished_at      = time.time()
    job.execution_time_ms = int((job.finished_at - job.started_at) * 1000)

    if exit_code != 0 or not output_path.exists():
        job.status        = "error"
        job.error_message = stderr or "Unknown execution error"
    else:
        try:
            df = pd.read_csv(output_path)
            job.status          = "success"
            job.output_csv_path = output_path
            job.preview_rows    = df.head(settings.PREVIEW_ROW_COUNT).to_dict(orient="records")
            job.preview_columns = list(df.columns)
        except Exception as exc:
            job.status        = "error"
            job.error_message = f"Failed to read output CSV: {exc}"

    await session_store.add_job(session.session_id, job)
```

---

## 13. API Dependencies — `app/api/dependencies.py`

```python
from fastapi import Depends, HTTPException

from app.session.session_store import SessionData, session_store


async def get_session(session_id: str) -> SessionData:
    session = await session_store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return session
```

---

## 14. API Routes — `app/api/v1/`

### `app/api/v1/upload.py`

```python
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config.settings import settings
from app.schemas.upload import UploadResponse
from app.services.file_service import save_and_parse_file

router = APIRouter(prefix="/upload", tags=["upload"])


@router.post("", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
    # Validate extension
    suffix = "." + (file.filename or "").rsplit(".", 1)[-1].lower()
    if suffix not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Only {settings.ALLOWED_EXTENSIONS} files accepted")

    # Validate size
    content = await file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(413, f"File exceeds {settings.MAX_UPLOAD_SIZE_MB} MB limit")

    session = await save_and_parse_file(file.filename or "upload", content)

    return UploadResponse(
        session_id      = session.session_id,
        filename        = session.filename,
        row_count       = session.row_count,
        column_count    = session.column_count,
        columns         = session.columns,
        dtypes          = session.dtypes,
        file_size_bytes = len(content),
    )
```

### `app/api/v1/instructions.py`

```python
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_session
from app.schemas.instruction import RefineRequest
from app.services.instruction_service import stream_refined_instructions
from app.utils.streaming import sse_event_generator

router = APIRouter(prefix="/instructions", tags=["instructions"])


@router.post("/refine")
async def refine_instructions(body: RefineRequest) -> StreamingResponse:
    session = await get_session(body.session_id)
    stream  = stream_refined_instructions(session, body.raw_instructions)
    return StreamingResponse(
        sse_event_generator(stream),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

### `app/api/v1/codegen.py`

```python
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_session
from app.schemas.codegen import CodeFixRequest, CodeGenRequest
from app.services.codegen_service import stream_fixed_code, stream_generated_code
from app.utils.streaming import sse_event_generator

router = APIRouter(prefix="/codegen", tags=["codegen"])


@router.post("/generate")
async def generate_code(body: CodeGenRequest) -> StreamingResponse:
    session = await get_session(body.session_id)
    stream  = stream_generated_code(session, body.refined_prompt)
    return StreamingResponse(
        sse_event_generator(stream),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/fix")
async def fix_code(body: CodeFixRequest) -> StreamingResponse:
    session = await get_session(body.session_id)
    stream  = stream_fixed_code(session, body.broken_code, body.error_message)
    return StreamingResponse(
        sse_event_generator(stream),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

### `app/api/v1/execution.py`

```python
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.api.dependencies import get_session
from app.schemas.execution import ExecuteRequest, ExecutionResult
from app.services.execution_service import submit_execution
from app.session.session_store import session_store

router = APIRouter(prefix="/execute", tags=["execution"])


@router.post("", response_model=dict)
async def execute_code(body: ExecuteRequest) -> dict:
    session = await get_session(body.session_id)
    try:
        job_id = await submit_execution(session, body.code)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"job_id": job_id}


@router.get("/{session_id}/{job_id}", response_model=ExecutionResult)
async def get_job_status(session_id: str, job_id: str) -> ExecutionResult:
    job = await session_store.get_job(session_id, job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    return ExecutionResult(
        job_id            = job.job_id,
        status            = job.status,
        preview_rows      = job.preview_rows,
        preview_columns   = job.preview_columns,
        error_message     = job.error_message,
        execution_time_ms = job.execution_time_ms,
    )


@router.get("/{session_id}/{job_id}/output")
async def download_output(session_id: str, job_id: str) -> FileResponse:
    job = await session_store.get_job(session_id, job_id)
    if job is None or job.status != "success" or job.output_csv_path is None:
        raise HTTPException(404, "Output not available")
    return FileResponse(
        path=str(job.output_csv_path),
        media_type="text/csv",
        filename=f"output_{job_id[:8]}.csv",
    )
```

### `app/api/v1/router.py`

```python
from fastapi import APIRouter
from .upload       import router as upload_router
from .instructions import router as instructions_router
from .codegen      import router as codegen_router
from .execution    import router as execution_router

v1_router = APIRouter()
v1_router.include_router(upload_router)
v1_router.include_router(instructions_router)
v1_router.include_router(codegen_router)
v1_router.include_router(execution_router)
```

---

## 15. Application Factory — `app/main.py`

Key responsibilities beyond a basic FastAPI app:
- `_configure_logging()` — sets up `RotatingFileHandler` writing to `LOG_DIR/app.<APP_ENV>.log`.
- `_validate_startup()` — asserts `ANTHROPIC_API_KEY` is set and all three dirs (`INBOUND_DIR`, `TEMP_DIR`, `LOG_DIR`) are writable; calls `sys.exit(1)` on failure so the process never starts silently broken.
- Health endpoint returns all three directory paths for ops visibility.

```python
from __future__ import annotations
import asyncio
import logging
import logging.handlers
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import v1_router
from app.config.settings import Settings, get_settings
from app.session.session_store import session_store


def _configure_logging(settings: Settings) -> None:
    level = getattr(logging, settings.LOG_LEVEL, logging.INFO)
    fmt   = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    formatter = logging.Formatter(fmt)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)

    log_dir  = Path(settings.LOG_DIR)
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"app.{settings.APP_ENV}.log"
    fh = logging.handlers.RotatingFileHandler(
        str(log_file),
        maxBytes=settings.LOG_MAX_BYTES,
        backupCount=settings.LOG_BACKUP_COUNT,
        encoding="utf-8",
    )
    fh.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()
    root.addHandler(console)
    root.addHandler(fh)


def _validate_startup(settings: Settings) -> None:
    errors: list[str] = []
    if not settings.ANTHROPIC_API_KEY:
        errors.append("ANTHROPIC_API_KEY is not set.")
    for name, path_str in [
        ("INBOUND_DIR", settings.INBOUND_DIR),
        ("TEMP_DIR",    settings.TEMP_DIR),
        ("LOG_DIR",     settings.LOG_DIR),
    ]:
        p = Path(path_str)
        try:
            p.mkdir(parents=True, exist_ok=True)
            probe = p / ".write_test"
            probe.touch(); probe.unlink()
        except Exception as exc:
            errors.append(f"{name} '{path_str}' is not writable: {exc}")
    if errors:
        for e in errors:
            logging.critical("Startup validation failed: %s", e)
        sys.exit(1)


# ── Background cleanup task ───────────────────────────────────────────────────
async def _cleanup_loop() -> None:
    log = logging.getLogger(__name__)
    while True:
        await asyncio.sleep(900)
        removed = await session_store.cleanup_expired()
        if removed:
            log.info("Session cleanup: removed %d expired sessions", removed)


def create_app() -> FastAPI:
    settings = get_settings()
    _configure_logging(settings)
    log = logging.getLogger(__name__)

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # type: ignore[type-arg]
        _validate_startup(settings)
        log.info("AI Code Builder starting — env=%s version=%s", settings.APP_ENV, settings.APP_VERSION)
        task = asyncio.create_task(_cleanup_loop())
        yield
        task.cancel()
        log.info("AI Code Builder stopped")

    app = FastAPI(
        title="AI Code Builder API",
        version=settings.APP_VERSION,
        lifespan=lifespan,
        docs_url="/docs" if not settings.is_production else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next: Any) -> Any:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"]        = "DENY"
        response.headers["Referrer-Policy"]        = "strict-origin-when-cross-origin"
        return response

    @app.middleware("http")
    async def log_requests(request: Request, call_next: Any) -> Any:
        start = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - start) * 1000
        log.info("%s %s → %d (%.0fms)", request.method, request.url.path, response.status_code, ms)
        return response

    @app.exception_handler(Exception)
    async def generic_handler(request: Request, exc: Exception) -> JSONResponse:
        log.exception("Unhandled error on %s", request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    @app.get("/health", tags=["health"])
    async def health() -> dict:
        return {
            "status":      "ok",
            "env":         settings.APP_ENV,
            "version":     settings.APP_VERSION,
            "inbound_dir": settings.INBOUND_DIR,
            "temp_dir":    settings.TEMP_DIR,
            "log_dir":     settings.LOG_DIR,
        }

    app.include_router(v1_router, prefix=settings.API_PREFIX)
    return app


app = create_app()
```

---

## 16. Running the Backend

### Using the service scripts (recommended)

`scripts/manage.py` is a cross-platform Python script (no external deps) that handles
venv creation, dependency installation, process management, PID tracking, and health polling.

```bash
# Windows
scripts\start.bat                      # backend only, development
scripts\start.bat --frontend           # backend + Vite dev server
scripts\start.bat --foreground         # stay in foreground (shows logs live)
scripts\start.bat --skip-deps          # skip pip/npm install (fast restart)
scripts\stop.bat
scripts\stop.bat --frontend
scripts\health.bat
scripts\status.bat

# Unix/macOS
bash scripts/start.sh
bash scripts/start.sh --frontend
bash scripts/stop.sh
bash scripts/health.sh
bash scripts/status.sh

# Direct (any OS)
python scripts/manage.py start --env development --port 8000
python scripts/manage.py stop
python scripts/manage.py health
python scripts/manage.py status
```

### Manual (dev only)

```bash
# Create and activate venv
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix:    source .venv/bin/activate

pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API docs are available at `http://localhost:8000/docs` in development mode.

### Prerequisites before first start

1. Create `backend/.env` containing just `APP_ENV=development`
2. Create `backend/.env.development` from `backend/.env.example` — fill in `ANTHROPIC_API_KEY`
3. Save both files as **UTF-8** (not UTF-16); in VSCode: click the encoding in the status bar → *Save with Encoding* → *UTF-8*

---

## 17. Complete Data Flow (End-to-End)

```
1. POST /upload
   - Receive multipart file
   - Write to TEMP_DIR/{session_id}/
   - Parse CSV/XLSX → pandas DataFrame
   - Cache as Parquet (faster re-reads)
   - Persist metadata in SessionStore
   - Return session_id + metadata

2. POST /instructions/refine  (SSE)
   - Load session metadata (column names)
   - Build refinement prompt
   - Stream Claude response
   - Frontend accumulates text into instructionStore.refinedPrompt

3. POST /codegen/generate  (SSE)
   - Load session + 3-row sample from Parquet
   - Build codegen prompt (schema + sample + user task)
   - Stream Claude response; strip markdown fences
   - Frontend accumulates text into codeStore

4. POST /execute
   - Validate code (AST security check)
   - Create ExecutionJob record (status=queued)
   - Fire asyncio.create_task (non-blocking)
   - Return job_id immediately

5. GET /execute/{session_id}/{job_id}  (poll)
   - Frontend polls every 1.5s
   - Returns current job status
   - On success: preview_rows + preview_columns
   - On error: error_message

6. GET /execute/{session_id}/{job_id}/output
   - Stream output.csv as FileResponse
```

---

## 18. Security Architecture

The application enforces four independent security layers for code execution:

| Layer | Mechanism | What it blocks |
|-------|-----------|----------------|
| 1 — Prompt    | System prompt rules    | Model generating forbidden imports |
| 2 — AST check | `validate_code()`      | Static detection before any execution |
| 3 — Subprocess isolation | `asyncio.create_subprocess_exec` | Crash/OOM in user code cannot kill FastAPI |
| 4 — Restricted builtins | `_WRAPPER_TEMPLATE`    | Runtime blocking of `__import__` abuse |

**Important:** Do not remove any of these layers. They are complementary, not redundant.

---

## 19. Common Pitfalls for Coding Agents

| Pitfall | Correct Approach |
|---------|-----------------|
| Blocking the event loop in a service | Use `asyncio.create_task` for long jobs; `aiofiles` for file I/O |
| Returning raw Pandas objects from routes | Always convert to plain Python dicts/lists in Pydantic response models |
| Forgetting `X-Accel-Buffering: no` on SSE | Nginx buffers SSE by default; this header disables it |
| Running user code in-process | Always use a subprocess; never `exec()` user code in the FastAPI process |
| Storing sessions in a database | In-memory `SessionStore` is intentional — it's stateless per restart by design |
| Hard-coding the Anthropic model | Always read `settings.ANTHROPIC_MODEL`; the model name changes over time |
| Missing `ALLOWED_ORIGINS` for the frontend port | CORS will block all browser requests if the frontend origin is not listed |
| Not stripping markdown fences from LLM output | Claude sometimes wraps code in ` ```python ` despite instructions; always strip |
