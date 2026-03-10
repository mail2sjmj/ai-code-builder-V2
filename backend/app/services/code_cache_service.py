"""Code cache service — links saved instruction labels to their executed code."""

import json
from datetime import datetime, timezone
from pathlib import Path

from app.config.settings import Settings
from app.utils.file_utils import safe_filename, safe_path_join


def _cache_dir(settings: Settings) -> Path:
    base = Path(settings.CODE_CACHE_DIR)
    base.mkdir(parents=True, exist_ok=True)
    return base


def save_code_cache(
    *,
    label: str,
    code: str,
    raw_instructions: str,
    refined_prompt: str,
    settings: Settings,
) -> str:
    """Persist code cache entry for the given instruction label. Always overwrites."""
    cleaned = safe_filename(label).replace(".json", "")
    if not cleaned:
        cleaned = "cached_code"

    filename = f"{cleaned}.json"
    folder = _cache_dir(settings)
    entry = {
        "label": label,
        "code": code,
        "raw_instructions": raw_instructions,
        "refined_prompt": refined_prompt,
        "saved_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    (folder / filename).write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
    return label


def get_code_cache(*, label: str, settings: Settings) -> dict | None:
    """Return the cached entry for the given instruction label, or None if not found."""
    cleaned = safe_filename(label).replace(".json", "")
    if not cleaned:
        return None

    filename = f"{cleaned}.json"
    folder = _cache_dir(settings)
    try:
        file_path = safe_path_join(str(folder), filename)
    except ValueError:
        return None

    if not file_path.exists():
        return None

    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
