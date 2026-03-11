"""
Application configuration via Pydantic BaseSettings.

Config is loaded in layered order (later = higher priority):
  1. Built-in field defaults
  2. .env                  — base/shared config (secrets live here; gitignored)
  3. .env.<APP_ENV>        — per-environment overrides (committed; no secrets)
  4. .env.<APP_ENV>.local  — personal local overrides (gitignored)
  5. OS environment variables (highest priority — always wins)

APP_ENV controls which overlay is applied. Defaults to "development".
"""

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
        env_file_encoding="utf-8-sig",  # handles UTF-8 with or without BOM
        case_sensitive=True,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    APP_ENV: Literal["development", "staging", "production"] = "development"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: list[str] = Field(
        default=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:80",
            "http://127.0.0.1:80",
        ]
    )

    # ── File Upload ───────────────────────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = Field(default=50, ge=1, le=500)
    ALLOWED_EXTENSIONS: list[str] = Field(default=[".csv", ".xlsx"])
    METADATA_SAMPLE_DEFAULT_ROWS: int = Field(default=100, ge=1, le=100_000)
    METADATA_SAMPLE_MAX_ROWS: int = Field(default=5_000, ge=1, le=1_000_000)

    # Inbound: where uploaded files (original + parquet cache) are stored.
    # Separate from TEMP_DIR so long-lived session data and ephemeral
    # sandbox artifacts can be placed on different storage volumes.
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

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        default="",
        description="PostgreSQL connection URL (postgresql+asyncpg://user:pass@host/db). Required for metadata persistence.",
    )

    # ── Sandbox Execution ─────────────────────────────────────────────────────
    # TEMP_DIR holds ephemeral per-execution artifacts (wrapper scripts, output CSVs).
    # Can point to a fast/local disk that is cleaned up more aggressively than INBOUND_DIR.
    TEMP_DIR: str = Field(
        default_factory=lambda: str(Path(tempfile.gettempdir()) / "code_builder_sessions")
    )
    SANDBOX_TIMEOUT_SECONDS: int = Field(default=30, ge=5, le=300)
    SANDBOX_MAX_MEMORY_MB: int = Field(default=512, ge=64, le=4096)
    SANDBOX_MAX_OUTPUT_ROWS: int = Field(default=100_000, ge=100)
    PREVIEW_ROW_COUNT: int = Field(default=50, ge=5, le=500)

    # ── Logging ───────────────────────────────────────────────────────────────
    # LOG_DIR: directory where rotating log files are written.
    LOG_DIR: str = Field(
        default_factory=lambda: str(Path(tempfile.gettempdir()) / "code_builder_logs")
    )
    # LOG_LEVEL: standard Python logging level name.
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    # LOG_MAX_BYTES: max size of a single log file before rotation (default 10 MB).
    LOG_MAX_BYTES: int = Field(default=10 * 1024 * 1024, ge=1024 * 1024)
    # LOG_BACKUP_COUNT: number of rotated files to keep.
    LOG_BACKUP_COUNT: int = Field(default=5, ge=0, le=20)

    # ── Anthropic AI ──────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = Field(default="", description="Required in production")
    LEGACY_MODEL: str = "claude-sonnet-4-6"  # legacy fallback; prefer REFINE_MODEL / CODEGEN_MODEL
    REFINE_MODEL: str = Field(default="claude-haiku-4-5-20251001")   # fast model for prompt expansion
    CODEGEN_MODEL: str = Field(default="claude-haiku-4-5-20251001")  # fast model; override to claude-sonnet-4-6 for complex tasks
    REFINE_MAX_TOKENS: int = Field(default=600, ge=256, le=4096)
    CODEGEN_MAX_TOKENS: int = Field(default=8192, ge=1024, le=32768)
    CODEGEN_SAMPLE_ROWS: int = Field(default=3, ge=1, le=100)
    AI_TEMPERATURE: float = Field(default=0.2, ge=0.0, le=1.0)
    AI_REQUEST_TIMEOUT_SECONDS: int = Field(default=120, ge=10, le=600)
    AI_MAX_RETRIES: int = Field(default=5, ge=0, le=10)

    # ── Validators ────────────────────────────────────────────────────────────

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalise_database_url(cls, v: object) -> str:
        if not isinstance(v, str) or not v:
            return ""
        from urllib.parse import urlparse, urlencode, parse_qs, urlunparse
        # Ensure asyncpg driver
        v = (
            v.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
             .replace("postgresql://", "postgresql+asyncpg://", 1)
        )
        # Strip params asyncpg doesn't understand (e.g. pgbouncer=true from Supabase)
        parsed = urlparse(v)
        params = {k: vals for k, vals in parse_qs(parsed.query).items() if k != "pgbouncer"}
        return urlunparse(parsed._replace(query=urlencode({k: v[0] for k, v in params.items()})))

    @field_validator("ALLOWED_EXTENSIONS", mode="before")
    @classmethod
    def parse_extensions(cls, v: object) -> list[str]:
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v  # type: ignore[return-value]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v  # type: ignore[return-value]

    # ── Computed properties ───────────────────────────────────────────────────

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_staging(self) -> bool:
        return self.APP_ENV == "staging"

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
    return ""  # unreachable with latin-1 fallback, but satisfies type-checker


def _resolve_env_files() -> tuple[str, ...]:
    """
    Build the ordered list of .env files to load.

    APP_ENV is discovered without instantiating Settings (which would create
    a chicken-and-egg problem).  Priority: OS env-var → .env file → "development".

    File priority (rightmost wins in pydantic-settings):
        .env  →  .env.<APP_ENV>  →  .env.<APP_ENV>.local
    """
    # OS env always takes priority
    app_env = os.environ.get("APP_ENV", "").strip()

    # Fall back to reading .env manually — byte-safe, no pydantic-settings involved
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

    overlay = f".env.{app_env}"
    if Path(overlay).exists():
        files.append(overlay)

    local_override = f".env.{app_env}.local"
    if Path(local_override).exists():
        files.append(local_override)

    return tuple(files)


@lru_cache
def get_settings() -> Settings:
    """
    Return a cached singleton Settings instance.

    Config files are resolved based on APP_ENV (see _resolve_env_files).
    OS environment variables always take the highest priority.
    """
    env_files = _resolve_env_files()
    settings = Settings(_env_file=env_files)  # type: ignore[call-arg]

    loaded = ", ".join(f for f in env_files if Path(f).exists())
    logger.info(
        "Settings loaded: env=%s files=[%s] version=%s refine_model=%s codegen_model=%s",
        settings.APP_ENV,
        loaded,
        settings.APP_VERSION,
        settings.REFINE_MODEL,
        settings.CODEGEN_MODEL,
    )
    return settings
