"""Schemas for code library save/list APIs."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SaveCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=120)
    visibility: Literal["public", "private"]


class SaveCodeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    saved_in: list[Literal["public", "private"]]
    filenames: list[str]


class CodeLibraryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str
    updated_at: str


class CodeLibraryListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visibility: Literal["public", "private"]
    items: list[CodeLibraryItem]
