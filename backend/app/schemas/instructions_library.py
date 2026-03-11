"""Pydantic schemas for the Instructions Library API."""

from pydantic import BaseModel, Field


class SaveInstructionRequest(BaseModel):
    instruction: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=120)
    overwrite: bool = False
    session_id: str | None = None  # if set, triggers dataset metadata persistence


class SaveInstructionResponse(BaseModel):
    filename: str


class InstructionLibraryItem(BaseModel):
    filename: str
    updated_at: str  # ISO timestamp


class InstructionLibraryListResponse(BaseModel):
    items: list[InstructionLibraryItem]
