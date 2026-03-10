"""Code cache API — save and retrieve instruction→code mappings."""

from fastapi import APIRouter, Depends, HTTPException

from app.config.settings import Settings, get_settings
from app.schemas.code_cache import CodeCacheEntry, SaveCodeCacheRequest, SaveCodeCacheResponse
from app.services.code_cache_service import get_code_cache, save_code_cache

router = APIRouter(prefix="/code-cache", tags=["code-cache"])


@router.post("/save", response_model=SaveCodeCacheResponse)
def save_cache(body: SaveCodeCacheRequest, settings: Settings = Depends(get_settings)):
    label = save_code_cache(
        label=body.label,
        code=body.code,
        raw_instructions=body.raw_instructions,
        refined_prompt=body.refined_prompt,
        settings=settings,
    )
    return SaveCodeCacheResponse(label=label)


@router.get("/{label}", response_model=CodeCacheEntry)
def get_cache(label: str, settings: Settings = Depends(get_settings)):
    entry = get_code_cache(label=label, settings=settings)
    if entry is None:
        raise HTTPException(status_code=404, detail="No cached code found for this label.")
    return entry
