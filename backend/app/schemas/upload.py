"""Pydantic schemas for the file upload endpoint."""

from pydantic import BaseModel, ConfigDict
from typing import Optional


class UploadResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    filename: str
    row_count: int
    column_count: int
    columns: list[str]
    dtypes: dict[str, str]
    file_size_bytes: int


class MetadataPreviewResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str
    column_count: int
    columns: list[str]
    dtypes: dict[str, str]
    file_size_bytes: int


class ColumnSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    column: str
    dtype: str
    record_count: int
    null_count: int
    count_with_values: int
    unique_count: int
    is_key_column: str          # "Yes" | "No"
    min_value: Optional[str]    # numeric columns only
    max_value: Optional[str]    # numeric columns only


class FileSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    filename: str
    columns: list[ColumnSummary]


class ColumnValuesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    column: str
    values: list[str]       # stringified values for display
    is_sample: bool         # True when showing 5 random samples (unique_count > 20)
