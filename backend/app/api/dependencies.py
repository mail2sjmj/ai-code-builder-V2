"""FastAPI dependency providers."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import Settings, get_settings
from app.db.engine import get_db
from app.session.session_store import SessionStore, get_session_store


def deps_settings() -> Settings:
    return get_settings()


def deps_session_store() -> SessionStore:
    return get_session_store()


async def deps_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_db():
        yield session
