"""File upload endpoint."""

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.dependencies import deps_session_store, deps_settings
from app.config.settings import Settings
from app.schemas.upload import MetadataPreviewResponse, UploadResponse
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
