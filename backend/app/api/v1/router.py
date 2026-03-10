"""Aggregated v1 API router."""

from fastapi import APIRouter

from app.api.v1 import code_cache, code_library, codegen, execution, instructions, instructions_library, upload

router = APIRouter()
router.include_router(upload.router)
router.include_router(instructions.router)
router.include_router(codegen.router)
router.include_router(execution.router)
router.include_router(code_library.router)
router.include_router(instructions_library.router)
router.include_router(code_cache.router)
