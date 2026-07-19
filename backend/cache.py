"""
MovieAnimation.ai - Response Caching Middleware
Phase 11: Beta Testing - Performance Optimization

Provides:
- In-memory response cache with TTL
- Cache-Control header management
- ETag generation
- Conditional request handling (If-None-Match)
"""

import hashlib
import json
import time
import logging
from typing import Optional, Dict, Any, Tuple
from threading import Lock

logger = logging.getLogger("movieanimation.cache")

class ResponseCache:
    """
    Thread-safe in-memory response cache with TTL support.
    
    Usage:
        cache = ResponseCache(max_size=1000, default_ttl=60)
        cache.set("key", data, ttl=30)
        data = cache.get("key")
    """
    
    def __init__(self, max_size: int = 1000, default_ttl: int = 60):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = Lock()
        self.max_size = max_size
        self.default_ttl = default_ttl
        self.hits = 0
        self.misses = 0
        logger.info(f"ResponseCache initialized: max_size={max_size}, default_ttl={default_ttl}s")
    
    def _evict_expired(self):
        """Remove expired entries."""
        now = time.time()
        expired = [k for k, v in self._cache.items() if v['expires_at'] <= now]
        for k in expired:
            del self._cache[k]
        if expired:
            logger.debug(f"Evicted {len(expired)} expired cache entries")
    
    def _evict_lru(self):
        """Remove least recently used entry if over max size."""
        if len(self._cache) >= self.max_size:
            oldest_key = min(self._cache, key=lambda k: self._cache[k]['last_access'])
            del self._cache[oldest_key]
            logger.debug(f"Evicted LRU cache entry: {oldest_key}")
    
    def get(self, key: str) -> Optional[Dict]:
        """Retrieve cached data by key. Returns None if missing or expired."""
        with self._lock:
            self._evict_expired()
            entry = self._cache.get(key)
            if entry and entry['expires_at'] > time.time():
                entry['last_access'] = time.time()
                self.hits += 1
                return entry['data']
            self.misses += 1
            return None
    
    def set(self, key: str, data: Dict, ttl: Optional[int] = None):
        """Store data in cache with optional TTL override."""
        with self._lock:
            self._evict_expired()
            self._evict_lru()
            ttl = ttl or self.default_ttl
            self._cache[key] = {
                'data': data,
                'expires_at': time.time() + ttl,
                'created_at': time.time(),
                'last_access': time.time()
            }
    
    def invalidate(self, key_pattern: Optional[str] = None):
        """Invalidate cache entries matching a key pattern."""
        with self._lock:
            if key_pattern is None:
                count = len(self._cache)
                self._cache.clear()
                logger.info(f"Cache cleared: {count} entries")
            else:
                keys = [k for k in self._cache if key_pattern in k]
                for k in keys:
                    del self._cache[k]
                logger.info(f"Invalidated {len(keys)} cache entries matching '{key_pattern}'")
    
    def stats(self) -> Dict:
        """Return cache statistics."""
        with self._lock:
            total = self.hits + self.misses
            hit_rate = (self.hits / total * 100) if total > 0 else 0
            return {
                "size": len(self._cache),
                "max_size": self.max_size,
                "hits": self.hits,
                "misses": self.misses,
                "hit_rate_pct": round(hit_rate, 2),
                "entries": [
                    {"key": k, "age_s": round(time.time() - v['created_at'], 1)}
                    for k, v in list(self._cache.items())[:20]
                ]
            }


def generate_etag(data: Any) -> str:
    """Generate an ETag hash for response data."""
    content = json.dumps(data, sort_keys=True, default=str).encode('utf-8')
    return f'W/"{hashlib.md5(content).hexdigest()}"'


def get_cache_key(request_path: str, user_id: Optional[str] = None) -> str:
    """Generate a cache key from request path and user context."""
    if user_id:
        return f"{user_id}:{request_path}"
    return request_path


# Global cache instance
response_cache = ResponseCache(max_size=500, default_ttl=30)

# Cache TTL configuration by endpoint pattern (seconds)
CACHE_TTL_CONFIG = {
    "/api/health": 10,
    "/api/status": 30,
    "/api/info": 300,
    "/api/costs/dashboard": 60,
    "/api/analytics/dashboard": 60,
    "/api/beta/testers": 30,
    "/api/feedback": 15,
    "/api/projects": 15,  # User-specific, shorter TTL
}


def get_cache_ttl(path: str) -> int:
    """Get cache TTL for a given path."""
    for pattern, ttl in CACHE_TTL_CONFIG.items():
        if path.startswith(pattern):
            return ttl
    return 0  # No cache by default


def apply_cache_headers(response_data: dict, path: str, status_code: int = 200) -> dict:
    """
    Generate appropriate Cache-Control headers dict for a response.
    Returns headers that can be added to FastAPI response.
    """
    ttl = get_cache_ttl(path)
    headers = {}
    
    if ttl > 0 and status_code == 200:
        headers["Cache-Control"] = f"public, max-age={ttl}, s-maxage={ttl * 2}"
        headers["ETag"] = generate_etag(response_data)
        headers["Vary"] = "Authorization, Accept-Encoding"
        headers["X-Cache-TTL"] = str(ttl)
    else:
        headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate"
        headers["Pragma"] = "no-cache"
        headers["Expires"] = "0"
    
    return headers


def should_cache(path: str, method: str) -> bool:
    """Determine if a request/response should be cached."""
    return method == "GET" and get_cache_ttl(path) > 0
