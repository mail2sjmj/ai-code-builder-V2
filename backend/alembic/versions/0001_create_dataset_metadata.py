"""create dataset_metadata table

Revision ID: 0001
Revises:
Create Date: 2026-03-10
"""

from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Any = None
branch_labels: Any = None
depends_on: Any = None


def upgrade() -> None:
    op.create_table(
        "dataset_metadata",
        sa.Column(
            "dataset_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("column_count", sa.Integer(), nullable=False),
        sa.Column("columns", postgresql.JSONB(), nullable=False),
        sa.Column("dtypes", postgresql.JSONB(), nullable=False),
        sa.Column("sample_file_path", sa.Text(), nullable=False),
        sa.Column("sample_parquet_path", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False
        ),
        sa.Column(
            "persisted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("dataset_metadata")
