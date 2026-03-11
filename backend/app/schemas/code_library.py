"""Schemas for code library save/list APIs."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SaveCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=120)
    visibility: Literal["public", "private"]
    overwrite: bool = False
    session_id: str | None = None  # if set, triggers dataset metadata persistence


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


class ShareToPublicResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str
    message: str


class ShareToUsersRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_ids: list[str] = Field(min_length=1)


class ShareToUsersResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str
    shared_to: list[str]


class CodeContentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str
    visibility: Literal["public", "private"]
    code: str
