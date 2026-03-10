"""
Python code generation service — calls Anthropic Claude with SSE streaming.
Strips markdown code fences from streamed output.
"""

import json
import logging
from collections.abc import AsyncIterator

import anthropic
import pandas as pd
from fastapi import HTTPException

from app.config.settings import Settings
from app.prompts.codegen_prompt import (
    AUTOFIX_SYSTEM_PROMPT,
    AUTOFIX_USER_PROMPT_TEMPLATE,
    CODEGEN_SYSTEM_PROMPT,
    CODEGEN_USER_PROMPT_TEMPLATE,
)
from app.session.session_store import SessionStore
from app.utils.ai_retry import anthropic_accumulate_with_retry, anthropic_stream_with_retry
from app.utils.anthropic_client import get_anthropic_client

logger = logging.getLogger(__name__)

# Fence patterns to strip from streaming output
_OPENING_FENCES = frozenset({"```python", "```py", "```"})
_CLOSING_FENCE = "```"


def _strip_fences(text: str) -> str:
    """Remove markdown code fences from a complete code string."""
    lines = text.splitlines()
    if lines and lines[0].strip() in _OPENING_FENCES:
        lines = lines[1:]
    if lines and lines[-1].strip() == _CLOSING_FENCE:
        lines = lines[:-1]
    return "\n".join(lines)


async def _stream_fenceless(text_stream: AsyncIterator[str]) -> AsyncIterator[str]:
    """
    Pass-through stream filter that drops opening and closing markdown fence lines.

    Buffers incoming deltas into complete lines, then emits each line — skipping
    the first line if it is a fence opener (e.g. ```python) and the final partial
    line if it is a fence closer (```).
    """
    line_buf = ""
    is_first_line = True

    async for delta in text_stream:
        line_buf += delta
        while "\n" in line_buf:
            line, line_buf = line_buf.split("\n", 1)
            if is_first_line:
                is_first_line = False
                if line.strip() in _OPENING_FENCES:
                    continue  # drop opening fence
            yield line + "\n"

    # Flush the final partial line (no trailing \n); drop if it is a closing fence
    if line_buf and line_buf.strip() != _CLOSING_FENCE:
        yield line_buf


async def stream_code_generation(
    session_id: str,
    refined_prompt: str,
    session_store: SessionStore,
    settings: Settings,
) -> AsyncIterator[str]:
    """
    Stream generated Python code from Anthropic Claude in real time.

    Yields:
        Code text deltas as they arrive, with markdown fences filtered out.
    Raises:
        HTTPException 404 if session not found.
        HTTPException 429 if rate-limited after all retries exhausted.
        HTTPException 502 on unrecoverable Anthropic API errors.
    """
    session = await session_store.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "SESSION_NOT_FOUND", "message": f"Session '{session_id}' not found."},
        )

    # Load sample data for context
    try:
        df_sample = pd.read_parquet(session.parquet_path).head(settings.CODEGEN_SAMPLE_ROWS)
        sample_data_json = json.dumps(df_sample.to_dict(orient="records"), default=str, indent=2)
    except Exception as exc:
        logger.warning("Could not load sample data: %s", exc)
        sample_data_json = "[]"

    column_schema_detailed = "\n".join(
        f"  - {col}: {dtype}" for col, dtype in session.dtypes.items()
    )
    user_prompt = CODEGEN_USER_PROMPT_TEMPLATE.format(
        refined_prompt=refined_prompt,
        filename=session.filename,
        row_count=session.row_count,
        column_schema_detailed=column_schema_detailed,
        sample_row_count=settings.CODEGEN_SAMPLE_ROWS,
        sample_data_json=sample_data_json,
    )

    client = get_anthropic_client(settings.ANTHROPIC_API_KEY)

    def make_stream():
        return client.messages.stream(
            model=settings.CODEGEN_MODEL,
            max_tokens=settings.CODEGEN_MAX_TOKENS,
            system=[{"type": "text", "text": CODEGEN_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_prompt}],
            extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
        )

    try:
        async for chunk in _stream_fenceless(
            anthropic_stream_with_retry(make_stream, max_retries=settings.AI_MAX_RETRIES)
        ):
            yield chunk
    except anthropic.RateLimitError as exc:
        logger.warning("Anthropic rate limit exhausted after %d retries: %s", settings.AI_MAX_RETRIES, exc)
        raise HTTPException(
            status_code=429,
            detail={"error_code": "RATE_LIMITED", "message": "AI service rate limit reached."},
        ) from exc
    except anthropic.APIError as exc:
        logger.exception("Anthropic API error during code gen: %s", exc)
        raise HTTPException(
            status_code=502,
            detail={"error_code": "AI_API_ERROR", "message": f"AI service error: {exc}"},
        ) from exc


async def stream_code_fix(
    session_id: str,
    broken_code: str,
    error_message: str,
    session_store: SessionStore,
    settings: Settings,
) -> AsyncIterator[str]:
    """
    Stream a corrected version of broken Python code from Anthropic Claude.

    Yields:
        Fixed code text (full, after fence-stripping).
    Raises:
        HTTPException 404 if session not found.
        HTTPException 429 if rate-limited after all retries exhausted.
        HTTPException 502 on unrecoverable Anthropic API errors.
    """
    session = await session_store.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "SESSION_NOT_FOUND", "message": f"Session '{session_id}' not found."},
        )

    user_prompt = AUTOFIX_USER_PROMPT_TEMPLATE.format(
        broken_code=broken_code,
        error_message=error_message,
    )

    client = get_anthropic_client(settings.ANTHROPIC_API_KEY)

    def make_stream():
        return client.messages.stream(
            model=settings.CODEGEN_MODEL,
            max_tokens=settings.CODEGEN_MAX_TOKENS,
            system=[{"type": "text", "text": AUTOFIX_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_prompt}],
            extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
        )

    try:
        raw = await anthropic_accumulate_with_retry(make_stream, max_retries=settings.AI_MAX_RETRIES)
        yield _strip_fences(raw)
    except anthropic.RateLimitError as exc:
        logger.warning("Anthropic rate limit exhausted after %d retries during auto-fix: %s", settings.AI_MAX_RETRIES, exc)
        raise HTTPException(
            status_code=429,
            detail={"error_code": "RATE_LIMITED", "message": "AI service rate limit reached."},
        ) from exc
    except anthropic.APIError as exc:
        logger.exception("Anthropic API error during auto-fix: %s", exc)
        raise HTTPException(
            status_code=502,
            detail={"error_code": "AI_API_ERROR", "message": f"AI service error: {exc}"},
        ) from exc
