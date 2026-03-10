"""Instructions library persistence and listing service."""

from datetime import datetime, timezone
from pathlib import Path

from app.config.settings import Settings
from app.utils.file_utils import safe_filename, safe_path_join


def _library_dir(settings: Settings) -> Path:
    base = Path(settings.INSTRUCTIONS_LIBRARY_DIR)
    base.mkdir(parents=True, exist_ok=True)
    return base


def save_instruction_to_library(
    *,
    instruction: str,
    label: str,
    settings: Settings,
    overwrite: bool = False,
) -> str:
    """
    Save instruction text to the library as a .txt file.

    Raises FileExistsError (with [LABEL_EXISTS] prefix) if label already
    exists and overwrite=False.

    Returns:
        Filename of the saved file.
    """
    cleaned_label = safe_filename(label).replace(".txt", "")
    if not cleaned_label:
        cleaned_label = "saved_instruction"

    filename = f"{cleaned_label}.txt"
    folder = _library_dir(settings)

    if not overwrite and (folder / filename).exists():
        raise FileExistsError(
            f"[LABEL_EXISTS] An instruction with label '{label}' already exists."
        )

    (folder / filename).write_text(instruction, encoding="utf-8")
    return filename


def list_library_instructions(*, settings: Settings) -> list[dict[str, str]]:
    """Return all saved instructions sorted by modification time (newest first)."""
    folder = _library_dir(settings)
    entries: list[dict[str, str]] = []
    for path in sorted(folder.glob("*.txt"), key=lambda p: p.stat().st_mtime, reverse=True):
        ts = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
        entries.append({"filename": path.name, "updated_at": ts})
    return entries


def get_instruction_text(*, filename: str, settings: Settings) -> str:
    """Read and return the text of a saved instruction."""
    folder = _library_dir(settings)
    file_path = safe_path_join(str(folder), filename)
    if not file_path.exists():
        raise FileNotFoundError(f"Instruction '{filename}' not found.")
    return file_path.read_text(encoding="utf-8")


def delete_instruction_from_library(*, filename: str, settings: Settings) -> None:
    """Delete a saved instruction. Raises FileNotFoundError if not found."""
    folder = _library_dir(settings)
    file_path = safe_path_join(str(folder), filename)
    if not file_path.exists():
        raise FileNotFoundError(f"Instruction '{filename}' not found.")
    file_path.unlink()
