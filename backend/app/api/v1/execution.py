"""Code execution endpoints — submit, poll, download."""

import logging

from fastapi import APIRouter, Depends
from fastapi import HTTPException
from fastapi.responses import FileResponse

from app.api.dependencies import deps_session_store, deps_settings
from app.config.settings import Settings
from app.schemas.execution import ExecuteRequest, ExecutionJobResponse, ExecutionResult
from app.services.execution_service import (
    get_execution_result,
    submit_execution_job,
)
from app.session.session_store import SessionStore

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Execution"])


@router.post(
    "/execute",
    response_model=ExecutionJobResponse,
    summary="Submit code for sandboxed execution",
    description="Validates and queues code execution. Returns a job_id for polling.",
)
async def submit_execution(
    body: ExecuteRequest,
    settings: Settings = Depends(deps_settings),
    session_store: SessionStore = Depends(deps_session_store),
) -> ExecutionJobResponse:
    job_id = await submit_execution_job(
        session_id=body.session_id,
        code=body.code,
        session_store=session_store,
        settings=settings,
    )
    return ExecutionJobResponse(job_id=job_id, status="queued")


@router.get(
    "/execute/{session_id}/{job_id}",
    response_model=ExecutionResult,
    summary="Poll execution job status",
    description="Returns current status, preview rows, and error details if any.",
)
async def get_execution_status(
    session_id: str,
    job_id: str,
    session_store: SessionStore = Depends(deps_session_store),
) -> ExecutionResult:
    job = await get_execution_result(job_id, session_id, session_store)
    return ExecutionResult(
        job_id=job.job_id,
        status=job.status,
        preview_rows=job.preview_rows,
        preview_columns=job.preview_columns,
        error_message=job.error_message,
        execution_time_ms=job.execution_time_ms,
    )


@router.get(
    "/execute/{session_id}/{job_id}/download",
    summary="Download execution output as CSV",
    description="Streams the complete output CSV file for download.",
)
async def download_output_csv(
    session_id: str,
    job_id: str,
    session_store: SessionStore = Depends(deps_session_store),
) -> FileResponse:
    job = await get_execution_result(job_id, session_id, session_store)
    if job.status != "success" or not job.output_csv_path:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "OUTPUT_NOT_READY", "message": "Output CSV is not available yet."},
        )

    return FileResponse(
        path=job.output_csv_path,
        media_type="text/csv",
        filename="output.csv",
    )
