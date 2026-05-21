/**
 * cacheService.ts - Phase 11: In-Memory Response Caching
 * Simple TTL-based cache for API responses to reduce redundant computation.
 *
 * Features:
 * - TTL-based key expiration
 * - LRU-ish eviction (max size limit)
 * - Cache hit/miss stats for monitoring
 * - Automatic cleanup interval
 */

interface CacheEntry<T = any> {
  value: T;
  expiresAt: number;
  hits: number;
  createdAt: number;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: string;
  evictions: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry>();
  private maxSize: number;
  private defaultTTL: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: { maxSize?: number; defaultTTL?: number; cleanupIntervalMs?: number } = {}) {
    this.maxSize = options.maxSize || 500;
    this.defaultTTL = options.defaultTTL || 60_000; // 1 minute default

    // Periodic cleanup of expired entries
    const interval = options.cleanupIntervalMs || 120_000; // Every 2 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), interval);

    // Don't prevent process exit
    if (this.cleanupTimer?.unref) {
      this.cleanupTimer.unref();
    }
  }

  /** Get a cached value, returns undefined if missing/expired */
  get<T = any>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    entry.hits++;
    this.hits++;
    return entry.value as T;
  }

  /** Set a value with optional custom TTL (ms) */
  set<T = any>(key: string, value: T, ttlMs?: number): void {
    const effectiveTTL = ttlMs ?? this.defaultTTL;

    // Evict oldest entry if at max capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.evictOldest();
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + effectiveTTL,
      hits: 0,
      createdAt: Date.now(),
    });
  }

  /** Remove a key from the cache */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Clear the entire cache */
  clear(): void {
    this.store.clear();
  }

  /** Get cache statistics */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(1) + '%' : '0.0%',
      evictions: this.evictions,
    };
  }

  /** Remove all expired entries */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Evict the oldest entry (lowest createdAt) */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.store.delete(oldestKey);
      this.evictions++;
    }
  }

  /** Stop cleanup and release resources */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }
}

// Singleton cache instance
export const apiCache = new MemoryCache({ maxSize: 1000, defaultTTL: 30_000 }); // 30s default

export { MemoryCache };
export type { CacheStats };
