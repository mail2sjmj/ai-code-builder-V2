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
    overwrite: bool = False,
) -> tuple[list[Literal["public", "private"]], list[str]]:
    """
    Save code in library.
    - public: save in both public and private
    - private: save in private only
    Raises FileExistsError (with [LABEL_EXISTS] prefix) if label already exists and overwrite=False.
    """
    cleaned_label = safe_filename(label).replace(".py", "")
    if not cleaned_label:
        cleaned_label = "saved_code"

    filename = f"{cleaned_label}.py"
    destinations: list[Literal["public", "private"]] = ["private"] if visibility == "private" else ["public", "private"]

    if not overwrite:
        for dest in destinations:
            folder = _visibility_dir(settings, dest)
            if (folder / filename).exists():
                raise FileExistsError(
                    f"[LABEL_EXISTS] A code file with label '{label}' already exists in the {dest} library."
                )

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


def _safe_py_filename(filename: str) -> str:
    """Sanitize and validate that filename is a safe .py file name."""
    name = safe_filename(filename)
    if not name.endswith(".py"):
        raise ValueError(f"Only .py files are allowed; got '{filename}'.")
    return name


def delete_code_from_library(
    *,
    visibility: Literal["public", "private"],
    filename: str,
    settings: Settings,
) -> None:
    safe_name = _safe_py_filename(filename)
    folder = _visibility_dir(settings, visibility)
    file_path = safe_path_join(str(folder), safe_name)
    if not file_path.exists():
        raise FileNotFoundError(f"File '{safe_name}' not found in {visibility} library.")
    file_path.unlink()


def get_code_content(
    *,
    visibility: Literal["public", "private"],
    filename: str,
    settings: Settings,
) -> str | None:
    """Return the raw code content of a saved library file, or None if not found."""
    safe_name = _safe_py_filename(filename)
    folder = _visibility_dir(settings, visibility)
    try:
        file_path = safe_path_join(str(folder), safe_name)
    except ValueError:
        return None
    if not file_path.exists():
        return None
    return file_path.read_text(encoding="utf-8")


def share_code_to_public(
    *,
    filename: str,
    settings: Settings,
) -> None:
    """Copy a private code file to the public library."""
    safe_name = _safe_py_filename(filename)
    private_dir = _visibility_dir(settings, "private")
    src = safe_path_join(str(private_dir), safe_name)
    if not src.exists():
        raise FileNotFoundError(f"File '{safe_name}' not found in private library.")
    public_dir = _visibility_dir(settings, "public")
    dst = public_dir / safe_name
    dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")


def share_code_to_users(
    *,
    filename: str,
    user_ids: list[str],
    settings: Settings,
) -> list[str]:
    """Copy a private code file to per-user shared directories."""
    safe_name = _safe_py_filename(filename)
    private_dir = _visibility_dir(settings, "private")
    src = safe_path_join(str(private_dir), safe_name)
    if not src.exists():
        raise FileNotFoundError(f"File '{safe_name}' not found in private library.")
    code = src.read_text(encoding="utf-8")
    shared_base = Path(settings.CODE_LIBRARY_DIR) / "shared"
    shared_to: list[str] = []
    for uid in user_ids:
        uid = uid.strip()
        if not uid:
            continue
        safe_uid = safe_filename(uid)
        user_dir = shared_base / safe_uid
        user_dir.mkdir(parents=True, exist_ok=True)
        (user_dir / safe_name).write_text(code, encoding="utf-8")
        shared_to.append(safe_uid)
    return shared_to
