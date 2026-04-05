import hashlib
import tempfile
import os
from typing import Tuple, Optional
import httpx
from .tribe_service import is_url_safe
from .retry import retry_with_backoff

class MediaCache:
    def __init__(self):
        self.temp_dir = tempfile.mkdtemp(prefix="neurox_cache_")
        self._cache = {}
    
    async def get_or_download(self, url: str) -> Tuple[bytes, str]:
        """Download media once, cache for reuse"""
        if url in self._cache:
            return self._cache[url]
        
        if not is_url_safe(url):
            raise ValueError(f"URL not allowed: {url}")
        
        async def _download():
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.content
        
        data = await retry_with_backoff(_download)
        
        cache_key = hashlib.md5(url.encode()).hexdigest()
        cache_path = f"{self.temp_dir}/{cache_key}"
        
        with open(cache_path, 'wb') as f:
            f.write(data)
        
        self._cache[url] = (data, cache_path)
        return data, cache_path
    
    def cleanup(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        self._cache.clear()

media_cache = MediaCache()