import asyncio
import os
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from alembic import context

from app.db.models import Base  # noqa: F401 — registers all models

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Load .env / .env.development so DATABASE_URL is available without manual export
try:
    from dotenv import load_dotenv
    _backend_dir = Path(__file__).resolve().parent.parent
    for _env_file in (".env.development", ".env"):
        _path = _backend_dir / _env_file
        if _path.exists():
            load_dotenv(_path, override=False)
            break
except ImportError:
    pass  # python-dotenv not installed — fall back to os.environ

# Normalise DATABASE_URL to always use asyncpg
database_url = os.environ.get("DATABASE_URL", "")
if not database_url:
    raise RuntimeError("DATABASE_URL is not set. Add it to backend/.env.development or export it.")

# Ensure asyncpg driver is used (handles plain postgresql:// from Supabase copy-paste too)
database_url = (
    database_url
    .replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    .replace("postgresql://", "postgresql+asyncpg://", 1)
)

# Strip query params that asyncpg doesn't understand (e.g. pgbouncer=true from Supabase pooler URLs)
from urllib.parse import urlparse, urlencode, parse_qs, urlunparse
_parsed = urlparse(database_url)
_params = {k: v for k, v in parse_qs(_parsed.query).items() if k not in ("pgbouncer",)}
database_url = urlunparse(_parsed._replace(query=urlencode({k: v[0] for k, v in _params.items()})))


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine: AsyncEngine = create_async_engine(
        database_url,
        poolclass=pool.NullPool,
    )
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


def run_migrations_offline() -> None:
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
