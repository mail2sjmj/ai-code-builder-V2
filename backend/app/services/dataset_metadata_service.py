"""
Service for persisting dataset metadata to PostgreSQL.

Metadata is written only when the user explicitly saves a function or
instructions — not on every upload. The dataset_id (UUID) is independent
of the transient session_id.
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DatasetMetadata
from app.session.session_store import SessionData

logger = logging.getLogger(__name__)


async def persist_dataset_metadata(
    session_data: SessionData, db: AsyncSession
) -> str:
    """
    Insert a DatasetMetadata row for the given session and return the dataset_id.

    Idempotent: if session_data.dataset_id is already set the row already exists;
    just returns the existing ID without inserting again.
    """
    if session_data.dataset_id is not None:
        logger.debug(
            "Metadata already persisted for session %s → dataset %s",
            session_data.session_id,
            session_data.dataset_id,
        )
        return session_data.dataset_id

    dataset_id = str(uuid.uuid4())
    row = DatasetMetadata(
        dataset_id=uuid.UUID(dataset_id),
        filename=session_data.filename,
        file_size_bytes=session_data.file_size_bytes,
        row_count=session_data.row_count,
        column_count=session_data.column_count,
        columns=session_data.columns,
        dtypes=session_data.dtypes,
        sample_file_path=session_data.file_path,
        sample_parquet_path=session_data.parquet_path,
        created_at=session_data.created_at,
        persisted_at=datetime.now(timezone.utc),
    )
    db.add(row)
    await db.commit()

    # Mark the in-memory session as persisted to prevent duplicate inserts
    session_data.dataset_id = dataset_id
    logger.info(
        "Dataset metadata persisted: session=%s dataset_id=%s filename=%s",
        session_data.session_id,
        dataset_id,
        session_data.filename,
    )
    return dataset_id


async def get_dataset_metadata(
    dataset_id: str, db: AsyncSession
) -> DatasetMetadata | None:
    """Fetch a persisted dataset metadata record by dataset_id."""
    result = await db.execute(
        select(DatasetMetadata).where(
            DatasetMetadata.dataset_id == uuid.UUID(dataset_id)
        )
    )
    return result.scalar_one_or_none()
