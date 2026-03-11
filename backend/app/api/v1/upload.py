"""File upload endpoint."""

import logging
import shutil
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.dependencies import deps_session_store, deps_settings
from app.config.settings import Settings
from app.schemas.upload import ColumnSummary, ColumnValuesResponse, FileSummaryResponse, MetadataPreviewResponse, UploadResponse
from app.services.file_service import (
    generate_sample_csv_from_metadata,
    parse_uploaded_file,
    preview_metadata_file,
)
from app.session.session_store import SessionStore

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Upload"])


@router.post(
    "/upload",
    response_model=UploadResponse,
    summary="Upload a CSV or XLSX file",
    description="Upload a data file to start a new session. Returns session metadata.",
)
async def upload_file(
    file: UploadFile,
    header_row: int | None = Form(None),
    meta_file: UploadFile | None = File(default=None),
    settings: Settings = Depends(deps_settings),
    session_store: SessionStore = Depends(deps_session_store),
) -> UploadResponse:
    session_id, session_data = await parse_uploaded_file(
        file, settings, header_row=header_row, meta_file=meta_file
    )
    await session_store.create_session(session_data)
    logger.info("Upload endpoint: new session %s", session_id)
    return UploadResponse(
        session_id=session_id,
        filename=session_data.filename,
        row_count=session_data.row_count,
        column_count=session_data.column_count,
        columns=session_data.columns,
        dtypes=session_data.dtypes,
        file_size_bytes=session_data.file_size_bytes,
    )


@router.post(
    "/upload/metadata-preview",
    response_model=MetadataPreviewResponse,
    summary="Preview metadata columns",
    description="Parses a metadata file and returns column names for sidebar display.",
)
async def metadata_preview(
    meta_file: UploadFile = File(...),
    settings: Settings = Depends(deps_settings),
) -> MetadataPreviewResponse:
    filename, column_count, columns, dtypes, file_size_bytes = await preview_metadata_file(meta_file, settings)
    return MetadataPreviewResponse(
        filename=filename,
        column_count=column_count,
        columns=columns,
        dtypes=dtypes,
        file_size_bytes=file_size_bytes,
    )


@router.post(
    "/upload/metadata-sample",
    summary="Generate sample CSV from metadata",
    description="Uses metadata headers to generate a synthetic CSV sample and returns it as a download.",
)
async def generate_metadata_sample(
    meta_file: UploadFile = File(...),
    row_count: int | None = Form(None),
    output_format: str = Form("csv"),
    settings: Settings = Depends(deps_settings),
) -> FileResponse:
    effective_row_count = settings.METADATA_SAMPLE_DEFAULT_ROWS if row_count is None else row_count
    if effective_row_count < 1 or effective_row_count > settings.METADATA_SAMPLE_MAX_ROWS:
        raise HTTPException(
            status_code=422,
            detail={
                "error_code": "INVALID_ROW_COUNT",
                "message": (
                    f"row_count must be between 1 and {settings.METADATA_SAMPLE_MAX_ROWS}."
                ),
            },
        )

    normalized_format = output_format.lower().strip()
    if normalized_format not in {"csv", "xlsx"}:
        raise HTTPException(
            status_code=422,
            detail={"error_code": "INVALID_FORMAT", "message": "output_format must be 'csv' or 'xlsx'."},
        )

    output_path, download_name = await generate_sample_csv_from_metadata(
        meta_file,
        settings,
        row_count=effective_row_count,
        output_format=normalized_format,
    )
    media_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if normalized_format == "xlsx"
        else "text/csv"
    )
    return FileResponse(
        path=str(output_path),
        media_type=media_type,
        filename=download_name,
    )


_NUMERIC_DTYPES = {"int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64", "float16", "float32", "float64"}


def _is_numeric_dtype(dtype_str: str) -> bool:
    return any(n in dtype_str.lower() for n in ("int", "float"))


@router.get(
    "/session/{session_id}/summary",
    response_model=FileSummaryResponse,
    summary="Get column-level summary statistics",
    description="Computes per-column stats (nulls, uniques, min/max) from the uploaded file.",
)
async def get_file_summary(
    session_id: str,
    session_store: SessionStore = Depends(deps_session_store),
) -> FileSummaryResponse:
    session = await session_store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"error_code": "SESSION_NOT_FOUND", "message": "Session not found."})

    df: pd.DataFrame = pd.read_parquet(session.parquet_path)
    row_count = len(df)

    column_summaries: list[ColumnSummary] = []
    for col in session.columns:
        dtype_str = session.dtypes.get(col, "object")
        series = df[col]
        null_count = int(series.isna().sum())
        unique_count = int(series.nunique(dropna=True))
        is_key = "Yes" if unique_count > 50 else "No"
        min_val: str | None = None
        max_val: str | None = None
        if _is_numeric_dtype(dtype_str):
            numeric = pd.to_numeric(series, errors="coerce")
            min_val = str(numeric.min()) if not numeric.isna().all() else None
            max_val = str(numeric.max()) if not numeric.isna().all() else None

        column_summaries.append(
            ColumnSummary(
                column=col,
                dtype=dtype_str,
                record_count=row_count,
                null_count=null_count,
                count_with_values=row_count - null_count,
                unique_count=unique_count,
                is_key_column=is_key,
                min_value=min_val,
                max_value=max_val,
            )
        )

    return FileSummaryResponse(
        session_id=session_id,
        filename=session.filename,
        columns=column_summaries,
    )


_MAX_FULL_VALUES = 20
_SAMPLE_COUNT = 5


@router.get(
    "/session/{session_id}/column-values",
    response_model=ColumnValuesResponse,
    summary="Get sample values for a column",
    description="Returns up to 20 unique values, or 5 random samples if unique count > 20.",
)
async def get_column_values(
    session_id: str,
    column: str,
    session_store: SessionStore = Depends(deps_session_store),
) -> ColumnValuesResponse:
    session = await session_store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"error_code": "SESSION_NOT_FOUND", "message": "Session not found."})
    if column not in session.columns:
        raise HTTPException(status_code=422, detail={"error_code": "INVALID_COLUMN", "message": f"Column '{column}' not found."})

    df: pd.DataFrame = pd.read_parquet(session.parquet_path, columns=[column])
    series = df[column].dropna()
    unique_count = series.nunique()

    if unique_count <= _MAX_FULL_VALUES:
        values = [str(v) for v in series.unique()[:_MAX_FULL_VALUES]]
        is_sample = False
    else:
        values = [str(v) for v in series.sample(n=_SAMPLE_COUNT, random_state=42).tolist()]
        is_sample = True

    return ColumnValuesResponse(column=column, values=values, is_sample=is_sample)


@router.delete(
    "/session/{session_id}",
    status_code=204,
    summary="Close a session and clean up unpersisted data",
    description=(
        "Called by the frontend on window close. "
        "If the session was never persisted to the database, the uploaded files are deleted. "
        "If it was persisted, only the in-memory session is removed."
    ),
)
async def close_session(
    session_id: str,
    session_store: SessionStore = Depends(deps_session_store),
    settings: Settings = Depends(deps_settings),
) -> None:
    session = await session_store.delete_session(session_id)
    if session is None:
        # Already expired or never existed — nothing to do
        return

    if session.dataset_id is None:
        # Never persisted → delete uploaded files from disk
        session_dir = Path(settings.INBOUND_DIR) / session_id
        if session_dir.exists():
            shutil.rmtree(session_dir, ignore_errors=True)
            logger.info("Deleted unpersisted session files: %s", session_dir)
    else:
        logger.info(
            "Session %s closed; files retained (persisted as dataset %s)",
            session_id,
            session.dataset_id,
        )
