"""
Instruction refinement service — calls Anthropic Claude with SSE streaming.
"""

import logging
from collections.abc import AsyncIterator

import anthropic
from fastapi import HTTPException

from app.config.settings import Settings
from app.prompts.refinement_prompt import (
    REFINEMENT_SYSTEM_PROMPT,
    REFINEMENT_USER_PROMPT_TEMPLATE,
)
from app.session.session_store import SessionStore
from app.utils.ai_retry import anthropic_stream_with_retry
from app.utils.anthropic_client import get_anthropic_client

logger = logging.getLogger(__name__)


async def stream_instruction_refinement(
    session_id: str,
    raw_instructions: str,
    session_store: SessionStore,
    settings: Settings,
) -> AsyncIterator[str]:
    """
    Stream a refined, structured prompt from Anthropic Claude.

    Yields:
        Text delta strings as they arrive from the model.
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

    column_schema = "\n".join(
        f"  - {col}: {dtype}" for col, dtype in session.dtypes.items()
    )
    user_prompt = REFINEMENT_USER_PROMPT_TEMPLATE.format(
        filename=session.filename,
        row_count=session.row_count,
        column_schema=column_schema,
        raw_instructions=raw_instructions,
    )

    client = get_anthropic_client(settings.ANTHROPIC_API_KEY)

    def make_stream():
        return client.messages.stream(
            model=settings.REFINE_MODEL,
            max_tokens=settings.REFINE_MAX_TOKENS,
            system=[{"type": "text", "text": REFINEMENT_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_prompt}],
            extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
        )

    try:
        async for text_delta in anthropic_stream_with_retry(
            make_stream, max_retries=settings.AI_MAX_RETRIES
        ):
            yield text_delta
    except anthropic.RateLimitError as exc:
        logger.warning("Anthropic rate limit exhausted after %d retries: %s", settings.AI_MAX_RETRIES, exc)
        raise HTTPException(
            status_code=429,
            detail={"error_code": "RATE_LIMITED", "message": "AI service rate limit reached. Please try again shortly."},
        ) from exc
    except anthropic.APIError as exc:
        logger.exception("Anthropic API error: %s", exc)
        raise HTTPException(
            status_code=502,
            detail={"error_code": "AI_API_ERROR", "message": f"AI service error: {exc}"},
        ) from exc
