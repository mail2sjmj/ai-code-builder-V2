"""Code library persistence and listing service."""

from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from app.config.settings import Settings
from app.utils.file_utils import safe_filename, safe_path_join


def _visibility_dir(settings: Settings, visibility: Literal["public", "private"]) -> Path:
    base = Path(settings.CODE_LIBRARY_DIR)
    base.mkdir(parents=True, exist_ok=True)
    target = safe_path_join(str(base), visibility)
    target.mkdir(parents=True, exist_ok=True)
    return target


def save_code_to_library(
    *,
    code: str,
    label: str,
    visibility: Literal["public", "private"],
    settings: Settings,
) -> tuple[list[Literal["public", "private"]], list[str]]:
    """
    Save code in library.
    - public: save in both public and private
    - private: save in private only
    """
    cleaned_label = safe_filename(label).replace(".py", "")
    if not cleaned_label:
        cleaned_label = "saved_code"

    destinations: list[Literal["public", "private"]] = ["private"] if visibility == "private" else ["public", "private"]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{cleaned_label}_{stamp}.py"

    saved_names: list[str] = []
    for dest in destinations:
        folder = _visibility_dir(settings, dest)
        out_path = folder / filename
        out_path.write_text(code, encoding="utf-8")
        saved_names.append(filename)

    return destinations, saved_names


def list_library_codes(
    *,
    visibility: Literal["public", "private"],
    settings: Settings,
) -> list[dict[str, str]]:
    folder = _visibility_dir(settings, visibility)
    entries: list[dict[str, str]] = []
    for path in sorted(folder.glob("*.py"), key=lambda p: p.stat().st_mtime, reverse=True):
        ts = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
        entries.append({"filename": path.name, "updated_at": ts})
    return entries
