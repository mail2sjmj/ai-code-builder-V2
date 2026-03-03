"""Pydantic schemas for the file upload endpoint."""

from pydantic import BaseModel, ConfigDict


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
