from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config.settings import get_settings

_engine = None
_AsyncSessionLocal = None


def _get_engine():
    global _engine, _AsyncSessionLocal
    if _engine is None:
        settings = get_settings()
        if not settings.DATABASE_URL:
            raise RuntimeError("DATABASE_URL is not configured.")
        _engine = create_async_engine(
            settings.DATABASE_URL,
            pool_pre_ping=True,
            echo=False,
        )
        _AsyncSessionLocal = async_sessionmaker(
            bind=_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _engine, _AsyncSessionLocal


@property
def engine():
    eng, _ = _get_engine()
    return eng


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    _, session_factory = _get_engine()
    async with session_factory() as session:
        yield session
