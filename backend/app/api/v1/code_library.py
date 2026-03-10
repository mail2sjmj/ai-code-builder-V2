"""Code library APIs."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import deps_settings
from app.config.settings import Settings
from app.schemas.code_library import (
    CodeContentResponse,
    CodeLibraryItem,
    CodeLibraryListResponse,
    SaveCodeRequest,
    SaveCodeResponse,
    ShareToPublicResponse,
    ShareToUsersRequest,
    ShareToUsersResponse,
)
from app.services.code_library_service import (
    delete_code_from_library,
    get_code_content,
    list_library_codes,
    save_code_to_library,
    share_code_to_public,
    share_code_to_users,
)

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
    try:
        saved_in, filenames = save_code_to_library(
            code=body.code,
            label=body.label,
            visibility=body.visibility,
            settings=settings,
            overwrite=body.overwrite,
        )
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail={"error_code": "LABEL_EXISTS", "message": str(exc)})
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
        raise HTTPException(status_code=422, detail={"error_code": "INVALID_VISIBILITY", "message": "visibility must be public or private"})
    items = [CodeLibraryItem(**it) for it in list_library_codes(visibility=visibility, settings=settings)]  # type: ignore[arg-type]
    return CodeLibraryListResponse(visibility=visibility, items=items)


@router.get(
    "/code-library/{visibility}/{filename}/content",
    response_model=CodeContentResponse,
    summary="Get the code content of a saved library file",
)
async def get_code_content_endpoint(
    visibility: str,
    filename: str,
    settings: Settings = Depends(deps_settings),
) -> CodeContentResponse:
    if visibility not in {"public", "private"}:
        raise HTTPException(status_code=422, detail={"error_code": "INVALID_VISIBILITY", "message": "visibility must be public or private"})
    try:
        code = get_code_content(visibility=visibility, filename=filename, settings=settings)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error_code": "INVALID_FILENAME", "message": str(exc)})
    if code is None:
        raise HTTPException(status_code=404, detail={"error_code": "NOT_FOUND", "message": f"File '{filename}' not found in {visibility} library."})
    return CodeContentResponse(filename=filename, visibility=visibility, code=code)  # type: ignore[arg-type]


@router.post(
    "/code-library/private/{filename}/share-public",
    response_model=ShareToPublicResponse,
    summary="Copy a private code file to the public library",
)
async def share_code_public(
    filename: str,
    settings: Settings = Depends(deps_settings),
) -> ShareToPublicResponse:
    try:
        share_code_to_public(filename=filename, settings=settings)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error_code": "INVALID_FILENAME", "message": str(exc)})
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"error_code": "NOT_FOUND", "message": str(exc)})
    return ShareToPublicResponse(filename=filename, message="Shared to public library successfully.")


@router.post(
    "/code-library/private/{filename}/share-users",
    response_model=ShareToUsersResponse,
    summary="Share a private code file with specific users",
)
async def share_code_users(
    filename: str,
    body: ShareToUsersRequest,
    settings: Settings = Depends(deps_settings),
) -> ShareToUsersResponse:
    try:
        shared_to = share_code_to_users(filename=filename, user_ids=body.user_ids, settings=settings)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error_code": "INVALID_FILENAME", "message": str(exc)})
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"error_code": "NOT_FOUND", "message": str(exc)})
    if not shared_to:
        raise HTTPException(status_code=400, detail={"error_code": "NO_VALID_USERS", "message": "No valid user IDs provided."})
    return ShareToUsersResponse(filename=filename, shared_to=shared_to)


@router.delete(
    "/code-library/{visibility}/{filename}",
    summary="Delete a saved code file from the library",
)
async def delete_code(
    visibility: str,
    filename: str,
    settings: Settings = Depends(deps_settings),
) -> dict[str, str]:
    if visibility not in {"public", "private"}:
        raise HTTPException(status_code=422, detail={"error_code": "INVALID_VISIBILITY", "message": "visibility must be public or private"})
    try:
        delete_code_from_library(visibility=visibility, filename=filename, settings=settings)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"error_code": "INVALID_FILENAME", "message": str(exc)})
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"error_code": "NOT_FOUND", "message": str(exc)})
    return {"deleted": filename}
