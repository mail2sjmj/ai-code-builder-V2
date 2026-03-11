import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

from app.db.models import Base  # noqa: F401 — registers all models

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Read DATABASE_URL from environment (overrides the blank value in alembic.ini)
database_url = os.environ.get("DATABASE_URL", "")
if database_url:
    # asyncpg URL must use sync driver for Alembic offline/online sync path;
    # replace asyncpg scheme with psycopg2 for sync Alembic runner
    config.set_main_option(
        "sqlalchemy.url",
        database_url.replace("postgresql+asyncpg", "postgresql+psycopg2", 1),
    )


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    async_url = config.get_main_option("sqlalchemy.url", "")
    # Use asyncpg for the actual async engine
    async_url = async_url.replace(
        "postgresql+psycopg2", "postgresql+asyncpg", 1
    )
    connectable = async_engine_from_config(
        {"sqlalchemy.url": async_url},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
