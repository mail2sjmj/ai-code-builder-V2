"""Schemas for code cache (instruction → executed code mapping)."""

from pydantic import BaseModel, Field


class SaveCodeCacheRequest(BaseModel):
    label: str = Field(min_length=1, max_length=200, description="Instruction label (without .txt)")
    code: str = Field(min_length=1)
    raw_instructions: str = Field(default="")
    refined_prompt: str = Field(default="")


class SaveCodeCacheResponse(BaseModel):
    label: str


class CodeCacheEntry(BaseModel):
    label: str
    code: str
    raw_instructions: str
    refined_prompt: str
    saved_at: str
