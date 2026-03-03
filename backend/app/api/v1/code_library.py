"""Code library APIs."""

from fastapi import APIRouter, Depends

from app.api.dependencies import deps_settings
from app.config.settings import Settings
from app.schemas.code_library import (
    CodeLibraryItem,
    CodeLibraryListResponse,
    SaveCodeRequest,
    SaveCodeResponse,
)
from app.services.code_library_service import list_library_codes, save_code_to_library

router = APIRouter(tags=["Code Library"])


@router.post(
    "/code-library/save",
    response_model=SaveCodeResponse,
    summary="Save Python code in code library",
)
async def save_code(
    body: SaveCodeRequest,
    settings: Settings = Depends(deps_settings),
) -> SaveCodeResponse:
    saved_in, filenames = save_code_to_library(
        code=body.code,
        label=body.label,
        visibility=body.visibility,
        settings=settings,
    )
    return SaveCodeResponse(saved_in=saved_in, filenames=filenames)


@router.get(
    "/code-library/{visibility}",
    response_model=CodeLibraryListResponse,
    summary="List saved Python files in code library",
)
async def list_codes(
    visibility: str,
    settings: Settings = Depends(deps_settings),
) -> CodeLibraryListResponse:
    if visibility not in {"public", "private"}:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail={"error_code": "INVALID_VISIBILITY", "message": "visibility must be public or private"})
    items = [CodeLibraryItem(**it) for it in list_library_codes(visibility=visibility, settings=settings)]  # type: ignore[arg-type]
    return CodeLibraryListResponse(visibility=visibility, items=items)
