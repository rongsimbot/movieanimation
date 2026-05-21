/**
 * rateLimiter.ts - Phase 11: Rate Limiting Middleware
 * 
 * Simple token-bucket rate limiter to prevent API abuse.
 * Separate limits for auth endpoints (stricter) and general API.
 */

import { Request, Response, NextFunction } from 'express';

// ─── Rate Limit Store ────────────────────────────────────────────

interface Bucket {
  tokens: number;
  lastRefill: number;
  warnings: number;
}

class RateLimitStore {
  private buckets = new Map<string, Bucket>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(cleanupIntervalMs: number = 300_000) { // Every 5 min
    this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    if (this.cleanupTimer?.unref) this.cleanupTimer.unref();
  }

  getBucket(key: string, maxTokens: number, refillRate: number): Bucket {
    let bucket = this.buckets.get(key);
    const now = Date.now();

    if (!bucket) {
      bucket = { tokens: maxTokens, lastRefill: now, warnings: 0 };
      this.buckets.set(key, bucket);
      return bucket;
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000; // seconds
    const refill = Math.floor(elapsed * refillRate);
    if (refill > 0) {
      bucket.tokens = Math.min(bucket.tokens + refill, maxTokens);
      bucket.lastRefill = now;
    }

    return bucket;
  }

  cleanup(): void {
    const now = Date.now();
    const TTL = 600_000; // Remove buckets inactive over 10 min
    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.lastRefill > TTL) {
        this.buckets.delete(key);
      }
    }
  }

  get size(): number {
    return this.buckets.size;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.buckets.clear();
  }
}

const store = new RateLimitStore();

// ─── Rate Limit Configs ──────────────────────────────────────────

interface RateLimitConfig {
  windowMs: number;       // Time window for rate limit
  maxRequests: number;    // Max requests in window
  message?: string;       // Custom error message
}

const DEFAULTS: Record<string, RateLimitConfig> = {
  general: { windowMs: 60_000, maxRequests: 60 },      // 60 req/min
  auth: { windowMs: 60_000, maxRequests: 10 },          // 10 req/min (stricter for auth)
  upload: { windowMs: 60_000, maxRequests: 20 },        // 20 req/min for uploads
  generation: { windowMs: 60_000, maxRequests: 5 },     // 5 req/min for video gen
};

// ─── Middleware ──────────────────────────────────────────────────

export function rateLimiter(config?: Partial<RateLimitConfig>) {
  const effective = { ...DEFAULTS.general, ...config };
  const refillRate = effective.maxRequests / (effective.windowMs / 1000); // tokens per second

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const bucket = store.getBucket(key, effective.maxRequests, refillRate);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', effective.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, bucket.tokens - 1));
    res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.lastRefill / 1000 + effective.windowMs / 1000));

    if (bucket.tokens <= 0) {
      bucket.warnings++;
      const retryAfter = Math.ceil((bucket.lastRefill + effective.windowMs - Date.now()) / 1000);
      res.setHeader('Retry-After', Math.max(1, retryAfter));

      res.status(429).json({
        error: effective.message || 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT',
        retryAfterSeconds: Math.max(1, retryAfter),
        requestId: req.requestId,
      });
      return;
    }

    bucket.tokens--;
    next();
  };
}

/** Pre-configured rate limiter for auth endpoints */
export const authRateLimiter = rateLimiter(DEFAULTS.auth);

/** Pre-configured rate limiter for file uploads */
export const uploadRateLimiter = rateLimiter(DEFAULTS.upload);

/** Pre-configured rate limiter for video generation */
export const generationRateLimiter = rateLimiter(DEFAULTS.generation);

export { store as rateLimitStore, DEFAULTS };
