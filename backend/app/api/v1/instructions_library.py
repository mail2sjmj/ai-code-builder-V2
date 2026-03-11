"""Instructions library APIs."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import deps_db, deps_session_store, deps_settings
from app.config.settings import Settings
from app.schemas.instructions_library import (
    InstructionLibraryItem,
    InstructionLibraryListResponse,
    SaveInstructionRequest,
    SaveInstructionResponse,
)
from app.services.dataset_metadata_service import persist_dataset_metadata
from app.services.instructions_library_service import (
    delete_instruction_from_library,
    get_instruction_text,
    list_library_instructions,
    save_instruction_to_library,
)
from app.session.session_store import SessionStore

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Instructions Library"])


@router.post(
    "/instructions-library/save",
    response_model=SaveInstructionResponse,
    summary="Save an instruction in the instructions library",
)
async def save_instruction(
    body: SaveInstructionRequest,
    settings: Settings = Depends(deps_settings),
    session_store: SessionStore = Depends(deps_session_store),
    db: AsyncSession = Depends(deps_db),
) -> SaveInstructionResponse:
    try:
        filename = save_instruction_to_library(
            instruction=body.instruction,
            label=body.label,
            settings=settings,
            overwrite=body.overwrite,
        )
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail={"error_code": "LABEL_EXISTS", "message": str(exc)})

    if body.session_id and settings.DATABASE_URL:
        session_data = await session_store.get_session(body.session_id)
        if session_data:
            try:
                await persist_dataset_metadata(session_data, db)
            except Exception:
                logger.exception("Failed to persist dataset metadata for session %s", body.session_id)

    return SaveInstructionResponse(filename=filename)


@router.get(
    "/instructions-library/list",
    response_model=InstructionLibraryListResponse,
    summary="List all saved instructions",
)
async def list_instructions(
    settings: Settings = Depends(deps_settings),
) -> InstructionLibraryListResponse:
    items = [InstructionLibraryItem(**it) for it in list_library_instructions(settings=settings)]
    return InstructionLibraryListResponse(items=items)


@router.get(
    "/instructions-library/{filename}",
    summary="Get the text of a saved instruction",
)
async def get_instruction(
    filename: str,
    settings: Settings = Depends(deps_settings),
) -> dict[str, str]:
    try:
        text = get_instruction_text(filename=filename, settings=settings)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"error_code": "NOT_FOUND", "message": str(exc)})
    return {"filename": filename, "instruction": text}


@router.delete(
    "/instructions-library/{filename}",
    summary="Delete a saved instruction",
)
async def delete_instruction(
    filename: str,
    settings: Settings = Depends(deps_settings),
) -> dict[str, str]:
    try:
        delete_instruction_from_library(filename=filename, settings=settings)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"error_code": "NOT_FOUND", "message": str(exc)})
    return {"deleted": filename}
