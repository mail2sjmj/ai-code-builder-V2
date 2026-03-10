"""
File upload and parsing service.
Handles validation, disk storage, pandas parsing, and session data extraction.
"""

import logging
import re
import uuid
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException, UploadFile

from app.config.settings import Settings
from app.session.session_store import SessionData
from app.utils.file_utils import get_session_dir, safe_filename

logger = logging.getLogger(__name__)

_FIRST_NAMES = [
    "Ava", "Liam", "Noah", "Emma", "Olivia", "Sophia", "Mia", "James", "Lucas", "Amelia",
]
_LAST_NAMES = [
    "Smith", "Johnson", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor", "Anderson", "Thomas",
]
_CITIES = [
    "New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Seattle", "Boston", "Austin", "Denver", "Miami",
]
_STATES = ["NY", "CA", "IL", "TX", "AZ", "WA", "MA", "CO", "FL", "GA"]
_COUNTRIES = ["USA", "Canada", "UK", "Germany", "India", "Australia", "UAE", "Singapore", "Japan", "Brazil"]
_CATEGORIES = ["Electronics", "Grocery", "Fashion", "Home", "Sports", "Beauty", "Books", "Toys", "Automotive", "Office"]
_PRODUCTS = ["Laptop", "Headphones", "Backpack", "Shoes", "Coffee Maker", "Desk Lamp", "Smartwatch", "T-shirt", "Notebook", "Water Bottle"]
_COMPANIES = ["Acme Corp", "Globex", "Initech", "Umbrella", "Wayne Tech", "Stark Industries", "Soylent", "Wonka", "Hooli", "Massive Dynamic"]
_STATUSES = ["New", "Pending", "In Progress", "Completed", "Cancelled"]
_PAYMENT_METHODS = ["Card", "UPI", "Cash", "NetBanking", "Wallet"]
_GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"]
_CURRENCIES = ["USD", "EUR", "INR", "GBP", "AED", "CAD"]

_SAMPLE_INSTRUCTIONS_FILENAME = "sample_data_generation_instructions.txt"
_REFINED_INSTRUCTIONS_FILENAME = "refined_instructions_sample_data.txt"
_REFINED_INSTRUCTIONS_HASH_FILENAME = "refined_instructions_sample_data.sha256"


def _read_metadata_dataframe(meta_file: UploadFile, content: bytes, settings: Settings) -> pd.DataFrame:
    """Read metadata file into a DataFrame."""
    original_name = meta_file.filename or "metadata"
    suffix = Path(original_name).suffix.lower()
    if suffix not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail={
                "error_code": "INVALID_FILE_TYPE",
                "message": f"File type '{suffix}' is not allowed. "
                           f"Accepted: {settings.ALLOWED_EXTENSIONS}",
            },
        )

    import io

    try:
        if suffix == ".xlsx":
            return pd.read_excel(io.BytesIO(content), header=0, engine="openpyxl")
        else:
            return _read_csv_with_encoding_fallback(io.BytesIO(content), header=0)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "error_code": "PARSE_ERROR",
                "message": f"Could not parse metadata file: {exc}",
            },
        ) from exc


def _normalize_header(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", header.lower()).strip()


def _extract_template_specs(meta_df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Extract attribute specs from metadata template rows.
    Expected template headers include:
    Attribute Name, Attribute Type, Attribute Length, Precision, Scale,
    Valid Values, Sample Data, Comments
    """
    normalized_map = {_normalize_header(str(c)): str(c) for c in meta_df.columns}
    attribute_name_col = normalized_map.get("attribute name")
    if attribute_name_col is None:
        return []

    def find_col(name: str) -> str | None:
        return normalized_map.get(name)

    attr_type_col = find_col("attribute type")
    attr_len_col = find_col("attribute length")
    precision_col = find_col("precision")
    scale_col = find_col("scale")
    valid_values_col = find_col("valid values")
    sample_data_col = find_col("sample data")
    comments_col = find_col("comments")

    specs: list[dict[str, Any]] = []
    for _, row in meta_df.iterrows():
        raw_name = row.get(attribute_name_col, "")
        name = str(raw_name).strip() if not pd.isna(raw_name) else ""
        if not name:
            continue
        specs.append(
            {
                "name": name,
                "type": "" if attr_type_col is None or pd.isna(row.get(attr_type_col)) else str(row.get(attr_type_col)).strip(),
                "length": None if attr_len_col is None or pd.isna(row.get(attr_len_col)) else str(row.get(attr_len_col)).strip(),
                "precision": None if precision_col is None or pd.isna(row.get(precision_col)) else str(row.get(precision_col)).strip(),
                "scale": None if scale_col is None or pd.isna(row.get(scale_col)) else str(row.get(scale_col)).strip(),
                "valid_values": "" if valid_values_col is None or pd.isna(row.get(valid_values_col)) else str(row.get(valid_values_col)).strip(),
                "sample_data": "" if sample_data_col is None or pd.isna(row.get(sample_data_col)) else str(row.get(sample_data_col)).strip(),
                "comments": "" if comments_col is None or pd.isna(row.get(comments_col)) else str(row.get(comments_col)).strip(),
            }
        )
    return specs


def _parse_metadata_specs(meta_file: UploadFile, content: bytes, settings: Settings) -> list[dict[str, Any]]:
    """
    Parse metadata into attribute specs.
    Supports:
    1) Template-row format with 'Attribute Name' and supporting columns.
    2) Legacy header-only format where file headers are treated as attributes.
    """
    meta_df = _read_metadata_dataframe(meta_file, content, settings)
    specs = _extract_template_specs(meta_df)
    if specs:
        return specs

    # Legacy path: attributes are file headers.
    columns = [str(col).strip() for col in meta_df.columns if str(col).strip()]
    if not columns:
        raise HTTPException(
            status_code=422,
            detail={"error_code": "EMPTY_METADATA", "message": "Metadata file contains no columns."},
        )
    return [
        {
            "name": col,
            "type": "",
            "length": None,
            "precision": None,
            "scale": None,
            "valid_values": "",
            "sample_data": "",
            "comments": "",
        }
        for col in columns
    ]


def _parse_int_safe(value: Any) -> int | None:
    if value is None:
        return None
    try:
        text = str(value).strip()
        return int(float(text))
    except (TypeError, ValueError):
        return None


def _parse_sql_type_details(
    raw_type: str,
    precision_hint: int | None,
    scale_hint: int | None,
    length_hint: int | None,
) -> dict[str, Any]:
    """
    Parse DB-style type expressions like:
    - VARCHAR(50), CHAR(10)
    - NUMBER(10,2), DECIMAL(12,4), NUMERIC(8)
    - INT, BIGINT, DATE, TIMESTAMP, BOOLEAN
    """
    text = raw_type.strip().lower()
    text = re.sub(r"\s+", "", text)
    if not text:
        return {"kind": "unknown", "base": "", "precision": precision_hint, "scale": scale_hint, "length": length_hint}

    m = re.match(r"([a-z0-9_]+)(?:\(([^)]*)\))?", text)
    if not m:
        return {"kind": "unknown", "base": text, "precision": precision_hint, "scale": scale_hint, "length": length_hint}

    base = m.group(1)
    args = [a.strip() for a in (m.group(2) or "").split(",") if a.strip()]
    arg_ints = [_parse_int_safe(a) for a in args]

    precision = precision_hint
    scale = scale_hint
    length = length_hint

    string_types = {"varchar", "varchar2", "nvarchar", "nvarchar2", "char", "nchar", "text", "string"}
    int_types = {"int", "integer", "bigint", "smallint", "tinyint"}
    decimal_types = {"number", "numeric", "decimal", "float", "double", "real"}
    bool_types = {"bool", "boolean", "bit"}

    if base in string_types:
        if length is None and arg_ints:
            length = arg_ints[0]
        return {"kind": "string", "base": base, "precision": precision, "scale": scale, "length": length}
    if base in int_types:
        return {"kind": "int", "base": base, "precision": precision, "scale": 0, "length": length}
    if base in decimal_types:
        if precision is None and arg_ints:
            precision = arg_ints[0]
        if scale is None:
            if len(arg_ints) >= 2 and arg_ints[1] is not None:
                scale = arg_ints[1]
            elif base in {"float", "double", "real"}:
                scale = 4
            else:
                scale = 0
        kind = "decimal" if (scale or 0) > 0 else "int"
        return {"kind": kind, "base": base, "precision": precision, "scale": scale, "length": length}
    if base in bool_types:
        return {"kind": "bool", "base": base, "precision": precision, "scale": scale, "length": length}
    if base == "date":
        return {"kind": "date", "base": base, "precision": precision, "scale": scale, "length": length}
    if base in {"datetime", "timestamp", "timestamptz", "timestampz"}:
        return {"kind": "datetime", "base": base, "precision": precision, "scale": scale, "length": length}
    if base == "time":
        return {"kind": "time", "base": base, "precision": precision, "scale": scale, "length": length}

    return {"kind": "unknown", "base": base, "precision": precision, "scale": scale, "length": length}


def _split_valid_values(raw: str) -> list[str]:
    if not raw.strip():
        return []
    parts = [p.strip() for p in re.split(r"[|,;/]+", raw) if p.strip()]
    return parts


def _build_sample_series(column_name: str, row_count: int, spec: dict[str, Any] | None = None) -> pd.Series:
    """Generate a sample series based on simple name heuristics."""
    name = column_name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "_", name).strip("_") or "value"
    tokens = [t for t in re.split(r"[^a-z0-9]+", name) if t]
    token_set = set(tokens)
    spec = spec or {}
    type_hint = str(spec.get("type", "")).lower().strip()
    comments = str(spec.get("comments", "")).lower().strip()
    valid_values = _split_valid_values(str(spec.get("valid_values", "")))
    sample_seed = str(spec.get("sample_data", "")).strip()
    precision = _parse_int_safe(spec.get("precision"))
    scale = _parse_int_safe(spec.get("scale"))
    length = _parse_int_safe(spec.get("length"))
    sql_type = _parse_sql_type_details(type_hint, precision, scale, length)
    precision = sql_type["precision"]
    scale = sql_type["scale"]
    length = sql_type["length"]

    if valid_values:
        series = pd.Series([valid_values[i % len(valid_values)] for i in range(row_count)])
        if length is not None and length > 0:
            series = series.astype(str).str.slice(0, length)
        return series

    if sample_seed:
        # If a sample seed exists, keep values close to it.
        numeric_match = re.fullmatch(r"\s*-?\d+(\.\d+)?\s*", sample_seed)
        if numeric_match:
            base = float(sample_seed)
            decimals = max(0, min(6, scale if scale is not None else 2))
            return pd.Series([round(base + (i * 0.5), decimals) for i in range(row_count)])
        series = pd.Series([f"{sample_seed}_{i + 1}" for i in range(row_count)])
        if length is not None and length > 0:
            series = series.astype(str).str.slice(0, length)
        return series

    # Strict type-driven generation from metadata type.
    if sql_type["kind"] == "bool":
        return pd.Series([(i % 2) == 0 for i in range(row_count)])
    if sql_type["kind"] == "date":
        return pd.Series(pd.date_range("2025-01-01", periods=row_count, freq="D")).dt.strftime("%Y-%m-%d")
    if sql_type["kind"] == "datetime":
        return pd.Series(pd.date_range("2025-01-01 09:00:00", periods=row_count, freq="h")).dt.strftime("%Y-%m-%d %H:%M:%S")
    if sql_type["kind"] == "time":
        return pd.Series(pd.date_range("2025-01-01 09:00:00", periods=row_count, freq="h")).dt.strftime("%H:%M:%S")
    if sql_type["kind"] == "int":
        return pd.Series([i + 1 for i in range(row_count)])
    if sql_type["kind"] == "decimal":
        decimals = max(0, min(6, scale if scale is not None else 2))
        whole_digits = max(1, (precision or 10) - decimals)
        whole_digits = min(whole_digits, 9)
        max_whole = (10 ** whole_digits) - 1
        return pd.Series([round(((i % max_whole) + 1) + 0.11, decimals) for i in range(row_count)])

    # Numeric-first rules to avoid collisions like Product_Weight -> product label.
    if "int" in type_hint or "integer" in type_hint or any(t in token_set for t in ("id",)):
        return pd.Series([i + 1 for i in range(row_count)])
    if "decimal" in type_hint or "number" in type_hint or "numeric" in type_hint or "float" in type_hint:
        decimals = max(0, min(6, scale if scale is not None else 2))
        return pd.Series([round(10 + (i * 1.25), decimals) for i in range(row_count)])
    if "bool" in type_hint:
        return pd.Series([(i % 2) == 0 for i in range(row_count)])
    if "date" in type_hint and "time" in type_hint:
        return pd.Series(pd.date_range("2025-01-01 09:00:00", periods=row_count, freq="h")).dt.strftime("%Y-%m-%d %H:%M:%S")
    if "date" in type_hint:
        return pd.Series(pd.date_range("2025-01-01", periods=row_count, freq="D")).dt.strftime("%Y-%m-%d")
    if "time" in type_hint:
        return pd.Series(pd.date_range("2025-01-01 09:00:00", periods=row_count, freq="h")).dt.strftime("%H:%M:%S")

    if "weight" in comments or any(t in token_set for t in ("weight", "wt")):
        decimals = max(0, min(6, scale if scale is not None else 2))
        return pd.Series([round(0.25 + ((i % 40) * 0.15), decimals) for i in range(row_count)])
    if any(t in token_set for t in ("height", "length", "width", "depth", "size")):
        decimals = max(0, min(6, scale if scale is not None else 2))
        return pd.Series([round(1 + ((i % 30) * 0.5), decimals) for i in range(row_count)])
    if any(k in name for k in ("amount", "price", "total", "cost", "revenue", "discount", "tax")):
        decimals = max(0, min(6, scale if scale is not None else 2))
        return pd.Series([round(20 + (i * 2.35), decimals) for i in range(row_count)])
    if any(t in token_set for t in ("qty", "quantity", "count", "units")):
        return pd.Series([(i % 25) + 1 for i in range(row_count)])
    if any(t in token_set for t in ("age",)):
        return pd.Series([18 + (i % 50) for i in range(row_count)])
    if any(t in token_set for t in ("score", "rating")):
        return pd.Series([round(1 + ((i % 5) + 0.2), 1) for i in range(row_count)])
    if "percent" in name or "pct" in name:
        return pd.Series([round((i * 3.7) % 100, 2) for i in range(row_count)])

    if "email" in name:
        return pd.Series([f"user{i + 1}@example.com" for i in range(row_count)])
    if "phone" in name or "mobile" in name or "contact" in name:
        return pd.Series([f"+1-202-555-{1000 + (i % 9000):04d}" for i in range(row_count)])
    if "first_name" in name:
        return pd.Series([_FIRST_NAMES[i % len(_FIRST_NAMES)] for i in range(row_count)])
    if "last_name" in name:
        return pd.Series([_LAST_NAMES[i % len(_LAST_NAMES)] for i in range(row_count)])
    if name == "name" or "full_name" in name or ("name" in name and "user" in name):
        return pd.Series([
            f"{_FIRST_NAMES[i % len(_FIRST_NAMES)]} {_LAST_NAMES[i % len(_LAST_NAMES)]}"
            for i in range(row_count)
        ])
    if "city" in name:
        return pd.Series([_CITIES[i % len(_CITIES)] for i in range(row_count)])
    if "state" in name or "province" in name:
        return pd.Series([_STATES[i % len(_STATES)] for i in range(row_count)])
    if "country" in name:
        return pd.Series([_COUNTRIES[i % len(_COUNTRIES)] for i in range(row_count)])
    if "zip" in name or "postal" in name or "pincode" in name:
        return pd.Series([f"{10000 + (i % 89999)}" for i in range(row_count)])
    if "address" in name:
        return pd.Series([f"{100 + (i % 900)} Main St" for i in range(row_count)])
    if "company" in name or "org" in name:
        return pd.Series([_COMPANIES[i % len(_COMPANIES)] for i in range(row_count)])
    if "product" in name or "item" in name:
        return pd.Series([_PRODUCTS[i % len(_PRODUCTS)] for i in range(row_count)])
    if "category" in name or "segment" in name:
        return pd.Series([_CATEGORIES[i % len(_CATEGORIES)] for i in range(row_count)])
    if "status" in name:
        return pd.Series([_STATUSES[i % len(_STATUSES)] for i in range(row_count)])
    if "payment" in name or "method" in name:
        return pd.Series([_PAYMENT_METHODS[i % len(_PAYMENT_METHODS)] for i in range(row_count)])
    if "gender" in name:
        return pd.Series([_GENDERS[i % len(_GENDERS)] for i in range(row_count)])
    if "currency" in name:
        return pd.Series([_CURRENCIES[i % len(_CURRENCIES)] for i in range(row_count)])
    if "url" in name or "website" in name:
        return pd.Series([f"https://example.com/{slug}/{i + 1}" for i in range(row_count)])
    if "sku" in name:
        return pd.Series([f"SKU-{100000 + i}" for i in range(row_count)])

    if "datetime" in name or ("date" in name and "time" in name):
        return pd.Series(pd.date_range("2025-01-01 09:00:00", periods=row_count, freq="h")).dt.strftime("%Y-%m-%d %H:%M:%S")
    if "date" in name:
        return pd.Series(pd.date_range("2025-01-01", periods=row_count, freq="D")).dt.strftime("%Y-%m-%d")
    if "time" in name:
        return pd.Series(pd.date_range("2025-01-01 09:00:00", periods=row_count, freq="h")).dt.strftime("%H:%M:%S")

    if name == "id" or name.endswith("_id") or name.endswith("id"):
        return pd.Series(range(1, row_count + 1))
    if "order" in name and "id" in name:
        return pd.Series([f"ORD-{10000 + i}" for i in range(row_count)])
    if "invoice" in name and "id" in name:
        return pd.Series([f"INV-{10000 + i}" for i in range(row_count)])

    if name.startswith("is_") or name.startswith("has_") or any(k in name for k in ("flag", "active", "enabled")):
        return pd.Series([(i % 2) == 0 for i in range(row_count)])

    values = [f"{slug}_{i + 1}" for i in range(row_count)]
    if length is not None and length > 0:
        values = [v[:length] for v in values]
    return pd.Series(values)


def _ensure_unique_rows(df: pd.DataFrame) -> pd.DataFrame:
    """Mutate duplicate rows to ensure output has no repeated full lines."""
    if df.empty or len(df.columns) == 0:
        return df

    seen: set[tuple[str, ...]] = set()
    first_col = df.columns[0]
    for idx in range(len(df)):
        row = df.iloc[idx]
        key = tuple(str(v) for v in row.tolist())
        if key in seen:
            current = df.at[idx, first_col]
            if isinstance(current, bool):
                df.at[idx, first_col] = not current
            elif isinstance(current, int):
                df.at[idx, first_col] = current + idx + 1
            elif isinstance(current, float):
                df.at[idx, first_col] = round(current + ((idx + 1) / 100), 6)
            else:
                df.at[idx, first_col] = f"{current}_{idx + 1}"
            key = tuple(str(v) for v in df.iloc[idx].tolist())
        seen.add(key)
    return df


def _load_or_refresh_refined_sample_instructions() -> str:
    """
    Maintain refined sample-data instructions file.
    Only regenerate refined file when source instructions file changes.
    """
    prompts_dir = Path(__file__).resolve().parent.parent / "prompts"
    prompts_dir.mkdir(parents=True, exist_ok=True)
    source_path = prompts_dir / _SAMPLE_INSTRUCTIONS_FILENAME
    refined_path = prompts_dir / _REFINED_INSTRUCTIONS_FILENAME
    hash_path = prompts_dir / _REFINED_INSTRUCTIONS_HASH_FILENAME

    if not source_path.exists():
        source_path.write_text(
            (
                "Generate realistic synthetic sample data from metadata attributes.\n"
                "Never add columns not defined in metadata.\n"
                "Respect type hints, comments, valid values, precision and scale.\n"
                "Avoid duplicate full rows.\n"
            ),
            encoding="utf-8",
        )

    source_text = source_path.read_text(encoding="utf-8", errors="replace")
    source_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
    prev_hash = hash_path.read_text(encoding="utf-8").strip() if hash_path.exists() else ""

    if source_hash != prev_hash or not refined_path.exists():
        lines = [ln.strip() for ln in source_text.splitlines() if ln.strip()]
        deduped: list[str] = []
        for ln in lines:
            if ln not in deduped:
                deduped.append(ln)
        refined_text = "Refined Instructions for Sample Data Generation:\n" + "\n".join(
            f"- {ln}" for ln in deduped
        )
        refined_path.write_text(refined_text + "\n", encoding="utf-8")
        hash_path.write_text(source_hash, encoding="utf-8")

    return refined_path.read_text(encoding="utf-8", errors="replace")


async def generate_sample_csv_from_metadata(
    meta_file: UploadFile,
    settings: Settings,
    *,
    row_count: int = 100,
    output_format: str = "csv",
) -> tuple[Path, str]:
    """Generate a synthetic sample file from metadata-only input and return file path + download name."""
    if row_count < 1:
        raise HTTPException(
            status_code=422,
            detail={"error_code": "INVALID_ROW_COUNT", "message": "row_count must be >= 1."},
        )

    content = await meta_file.read()
    file_size = len(content)
    if file_size > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=422,
            detail={
                "error_code": "FILE_TOO_LARGE",
                "message": f"File size {file_size / 1_048_576:.1f} MB exceeds "
                           f"limit of {settings.MAX_UPLOAD_SIZE_MB} MB.",
            },
        )
    if file_size == 0:
        raise HTTPException(
            status_code=422,
            detail={"error_code": "EMPTY_FILE", "message": "Uploaded metadata file is empty."},
        )

    # Maintain and consume refined instructions artifact for future extension.
    _ = _load_or_refresh_refined_sample_instructions()

    specs = _parse_metadata_specs(meta_file, content, settings)
    columns = [str(spec["name"]) for spec in specs]
    data = {col: _build_sample_series(col, row_count, spec=specs[i]) for i, col in enumerate(columns)}
    df = pd.DataFrame(data)
    df = _ensure_unique_rows(df)

    sample_id = uuid.uuid4().hex[:10]
    out_dir = Path(settings.TEMP_DIR) / "metadata_samples"
    out_dir.mkdir(parents=True, exist_ok=True)
    fmt = output_format.lower().strip()
    if fmt == "xlsx":
        output_path = out_dir / f"sample_{sample_id}.xlsx"
        df.to_excel(output_path, index=False, engine="openpyxl")
    else:
        output_path = out_dir / f"sample_{sample_id}.csv"
        df.to_csv(output_path, index=False, encoding="utf-8")

    stem = Path(meta_file.filename or "metadata").stem
    extension = "xlsx" if fmt == "xlsx" else "csv"
    download_name = safe_filename(f"{stem}_sample_{row_count}.{extension}")
    logger.info("Generated metadata sample file: %s rows=%d cols=%d", output_path, len(df), len(df.columns))
    return output_path, download_name


async def preview_metadata_file(
    meta_file: UploadFile,
    settings: Settings,
) -> tuple[str, int, list[str], dict[str, str], int]:
    """Parse metadata file and return preview fields for UI display."""
    content = await meta_file.read()
    file_size = len(content)
    if file_size > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=422,
            detail={
                "error_code": "FILE_TOO_LARGE",
                "message": f"File size {file_size / 1_048_576:.1f} MB exceeds "
                           f"limit of {settings.MAX_UPLOAD_SIZE_MB} MB.",
            },
        )
    if file_size == 0:
        raise HTTPException(
            status_code=422,
            detail={"error_code": "EMPTY_FILE", "message": "Uploaded metadata file is empty."},
        )

    specs = _parse_metadata_specs(meta_file, content, settings)
    columns = [str(spec["name"]) for spec in specs]
    dtypes = {col: "object" for col in columns}
    return (
        meta_file.filename or "metadata",
        len(columns),
        columns,
        dtypes,
        file_size,
    )


def _read_csv_with_encoding_fallback(source: Any, **kwargs: Any) -> pd.DataFrame:
    """
    Read a CSV, trying UTF-8 first then falling back to Latin-1.
    Handles files saved with Windows-1252/ISO-8859-1 encoding gracefully.
    """
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return pd.read_csv(source, encoding=enc, on_bad_lines="skip", **kwargs)
        except UnicodeDecodeError:
            # Reset buffer position if source is a file-like object
            if hasattr(source, "seek"):
                source.seek(0)
            continue
    # Last resort: replace undecodable bytes
    return pd.read_csv(source, encoding="utf-8", encoding_errors="replace", on_bad_lines="skip", **kwargs)


async def parse_uploaded_file(
    file: UploadFile,
    settings: Settings,
    *,
    header_row: int | None = None,
    meta_file: UploadFile | None = None,
) -> tuple[str, SessionData]:
    """
    Validate, store, and parse an uploaded CSV/XLSX file.

    Returns:
        (session_id, SessionData) on success.
    Raises:
        HTTPException 422 on validation failure.
        HTTPException 500 on unexpected errors.
    """
    # ── 1. Validate extension ────────────────────────────────────────────────
    original_name = file.filename or "upload"
    suffix = Path(original_name).suffix.lower()
    if suffix not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422,
            detail={
                "error_code": "INVALID_FILE_TYPE",
                "message": f"File type '{suffix}' is not allowed. "
                           f"Accepted: {settings.ALLOWED_EXTENSIONS}",
            },
        )

    # ── 2. Read content + validate size ─────────────────────────────────────
    content = await file.read()
    file_size = len(content)
    if file_size > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=422,
            detail={
                "error_code": "FILE_TOO_LARGE",
                "message": f"File size {file_size / 1_048_576:.1f} MB exceeds "
                           f"limit of {settings.MAX_UPLOAD_SIZE_MB} MB.",
            },
        )
    if file_size == 0:
        raise HTTPException(
            status_code=422,
            detail={"error_code": "EMPTY_FILE", "message": "Uploaded file is empty."},
        )

    # ── 3. Create session directory under INBOUND_DIR ────────────────────────
    # INBOUND_DIR holds uploaded files and their parquet caches for the
    # full session lifetime.  TEMP_DIR is reserved for sandbox execution
    # artifacts which are short-lived and can live on faster/ephemeral storage.
    session_id = str(uuid.uuid4())
    session_dir = get_session_dir(settings.INBOUND_DIR, session_id)
    session_dir.mkdir(parents=True, exist_ok=True)

    safe_name = safe_filename(original_name)
    file_path = session_dir / safe_name
    file_path.write_bytes(content)
    logger.info("Saved upload: %s (%d bytes) → %s", original_name, file_size, file_path)

    # ── 4. Parse with pandas ─────────────────────────────────────────────────
    try:
        if meta_file is not None:
            # Meta file supplies the column names; data file contains raw rows only.
            meta_content = await meta_file.read()
            meta_suffix = Path(meta_file.filename or "").suffix.lower()
            import io
            if meta_suffix == ".xlsx":
                meta_df = pd.read_excel(io.BytesIO(meta_content), header=0, nrows=0, engine="openpyxl")
            else:
                meta_df = _read_csv_with_encoding_fallback(io.BytesIO(meta_content), header=0, nrows=0)
            meta_columns = list(meta_df.columns)

            # Read the data file with no header — every row is a data row.
            if suffix == ".csv":
                df = _read_csv_with_encoding_fallback(file_path, header=None)
            else:
                df = pd.read_excel(file_path, header=None, engine="openpyxl")

            if len(df.columns) != len(meta_columns):
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error_code": "COLUMN_MISMATCH",
                        "message": (
                            f"Meta file has {len(meta_columns)} columns but data file has "
                            f"{len(df.columns)} columns. They must match."
                        ),
                    },
                )
            df.columns = meta_columns
            logger.info("Applied %d meta columns to data file", len(meta_columns))
        else:
            # header_row is 1-indexed from the user; pandas uses 0-indexed.
            pandas_header = (header_row - 1) if header_row is not None else 0
            if suffix == ".csv":
                df = _read_csv_with_encoding_fallback(file_path, header=pandas_header)
            else:
                df = pd.read_excel(file_path, header=pandas_header, engine="openpyxl")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to parse file: %s", exc)
        raise HTTPException(
            status_code=422,
            detail={
                "error_code": "PARSE_ERROR",
                "message": f"Could not parse file: {exc}",
            },
        ) from exc

    if df.empty:
        raise HTTPException(
            status_code=422,
            detail={"error_code": "EMPTY_DATASET", "message": "File contains no data rows."},
        )

    # ── 5. Cache as parquet for fast re-reads ────────────────────────────────
    parquet_path = session_dir / "data.parquet"
    df.to_parquet(parquet_path, index=False)

    # ── 6. Extract metadata ──────────────────────────────────────────────────
    session_data = SessionData(
        session_id=session_id,
        created_at=datetime.now(timezone.utc),
        file_path=str(file_path),
        parquet_path=str(parquet_path),
        filename=original_name,
        row_count=len(df),
        column_count=len(df.columns),
        columns=df.columns.tolist(),
        dtypes={col: str(dtype) for col, dtype in df.dtypes.items()},
        file_size_bytes=file_size,
    )
    logger.info(
        "Parsed file: session=%s rows=%d cols=%d",
        session_id,
        session_data.row_count,
        session_data.column_count,
    )
    return session_id, session_data
