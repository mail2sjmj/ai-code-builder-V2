"""
Shared Anthropic client singleton.

Creating an AsyncAnthropic client is expensive — it initialises an httpx.AsyncClient
with a new connection pool. Re-creating it on every request adds ~500 ms–1 s of
overhead. This module provides a cached singleton so the pool is reused.
"""

from functools import lru_cache

import anthropic


@lru_cache(maxsize=1)
def get_anthropic_client(api_key: str) -> anthropic.AsyncAnthropic:
    """Return a cached AsyncAnthropic client. Created once per unique API key."""
    return anthropic.AsyncAnthropic(api_key=api_key)
