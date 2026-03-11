"""
In-memory session store (thread-safe via asyncio.Lock).
Stores uploaded file metadata and execution job references per session.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ExecutionJob:
    job_id: str
    status: str  # queued | running | success | error
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    preview_rows: list[dict] = field(default_factory=list)
    preview_columns: list[str] = field(default_factory=list)
    error_message: Optional[str] = None
    execution_time_ms: Optional[int] = None
    output_csv_path: Optional[str] = None


@dataclass
class SessionData:
    session_id: str
    created_at: datetime
    file_path: str           # absolute path to uploaded file (original)
    parquet_path: str        # absolute path to parquet cache for fast reads
    filename: str
    row_count: int
    column_count: int
    columns: list[str]
    dtypes: dict[str, str]   # column → pandas dtype string
    file_size_bytes: int
    execution_jobs: dict[str, ExecutionJob] = field(default_factory=dict)
    dataset_id: Optional[str] = None  # set after metadata is persisted to DB; None = not yet persisted


class SessionStore:
    """Thread-safe in-memory session store backed by asyncio.Lock."""

    def __init__(self) -> None:
        self._store: dict[str, SessionData] = {}
        self._lock = asyncio.Lock()

    async def create_session(self, session_data: SessionData) -> None:
        async with self._lock:
            self._store[session_data.session_id] = session_data
            logger.info("Session created: %s", session_data.session_id)

    async def get_session(self, session_id: str) -> Optional[SessionData]:
        async with self._lock:
            return self._store.get(session_id)

    async def add_execution_job(
        self, session_id: str, job: ExecutionJob
    ) -> None:
        async with self._lock:
            session = self._store.get(session_id)
            if session:
                session.execution_jobs[job.job_id] = job

    async def update_execution_job(
        self, session_id: str, job: ExecutionJob
    ) -> None:
        async with self._lock:
            session = self._store.get(session_id)
            if session and job.job_id in session.execution_jobs:
                session.execution_jobs[job.job_id] = job

    async def get_execution_job(
        self, session_id: str, job_id: str
    ) -> Optional[ExecutionJob]:
        async with self._lock:
            session = self._store.get(session_id)
            if session:
                return session.execution_jobs.get(job_id)
            return None

    async def delete_session(self, session_id: str) -> Optional[SessionData]:
        """Remove a session from the store and return it (or None if not found)."""
        async with self._lock:
            session = self._store.pop(session_id, None)
            if session:
                logger.info("Session deleted: %s", session_id)
            return session

    async def cleanup_expired_sessions(self, ttl_seconds: int) -> int:
        """Remove sessions older than ttl_seconds. Returns count removed."""
        now = datetime.now(timezone.utc)
        expired_ids: list[str] = []

        async with self._lock:
            for sid, session in self._store.items():
                age = (now - session.created_at).total_seconds()
                if age > ttl_seconds:
                    expired_ids.append(sid)
            for sid in expired_ids:
                del self._store[sid]

        if expired_ids:
            logger.info("Expired %d session(s): %s", len(expired_ids), expired_ids)
        return len(expired_ids)

    @property
    def session_count(self) -> int:
        return len(self._store)


# Module-level singleton — shared across the FastAPI app lifetime
_store_instance: Optional[SessionStore] = None


def get_session_store() -> SessionStore:
    global _store_instance
    if _store_instance is None:
        _store_instance = SessionStore()
    return _store_instance
