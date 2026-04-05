import asyncio
import httpx
from typing import Callable, TypeVar, Any
from functools import wraps

T = TypeVar('T')

async def retry_with_backoff(
    func: Callable,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    exceptions: tuple = (httpx.RequestError, httpx.HTTPStatusError)
) -> Any:
    """Execute an async function with exponential backoff retry logic"""
    last_exception = None
    
    for attempt in range(max_retries):
        try:
            return await func()
        except exceptions as e:
            last_exception = e
            if attempt < max_retries - 1:
                delay = min(base_delay * (2 ** attempt), max_delay)
                print(f"[RETRY] Attempt {attempt + 1} failed: {e}. Retrying in {delay:.1f}s...")
                await asyncio.sleep(delay)
            else:
                print(f"[RETRY] All {max_retries} attempts failed. Last error: {e}")
    
    raise last_exception
