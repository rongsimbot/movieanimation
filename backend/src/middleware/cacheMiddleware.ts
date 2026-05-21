/**
 * cacheMiddleware.ts - Phase 7: Response Caching Middleware
 * 
 * Adds ETag-based conditional requests (304 Not Modified) and
 * cache-control headers to reduce bandwidth and server load.
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

// ─── ETag / Conditional Request Middleware ──────────────────────

interface ETagOptions {
  /** Max age in seconds for Cache-Control header */
  maxAge?: number;
  /** Whether to make the cache public (CDN-friendly) */
  public?: boolean;
  /** Whether to add immutable directive for hashed assets */
  immutable?: boolean;
}

/**
 * Middleware that generates ETags for responses and handles
 * If-None-Match conditional requests for 304 Not Modified.
 */
export function etagMiddleware(options: ETagOptions = {}) {
  const { maxAge = 60, public: isPublic = false, immutable = false } = options;

  function sendWithETag(res: Response, bodyStr: string, originalSend: (body: any) => Response): Response {
    const etag = crypto.createHash('md5').update(bodyStr).digest('hex').substring(0, 16);
    
    // Set cache headers
    const cacheControl: string[] = [];
    if (isPublic) cacheControl.push('public');
    else cacheControl.push('private');
    cacheControl.push(`max-age=${maxAge}`);
    if (immutable) cacheControl.push('immutable');
    res.setHeader('Cache-Control', cacheControl.join(', '));
    res.setHeader('ETag', `"${etag}"`);

    // Check If-None-Match
    const ifNoneMatch = res.req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch.includes(etag)) {
      return res.status(304).end();
    }

    return originalSend.call(res, bodyStr);
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip non-GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    // Intercept res.json and res.send to compute ETag
    const originalSend = res.send.bind(res);

    const intercept = function (this: Response, body: any): Response {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      return sendWithETag(this, bodyStr, originalSend);
    };

    res.json = intercept as any;
    res.send = intercept as any;

    next();
  };
}

// ─── Static Asset Caching Headers ───────────────────────────────

/**
 * Middleware for serving static assets with aggressive caching.
 * For hashed filenames (e.g., chunk-abc123.js), sets immutable + 1 year.
 * For other assets, sets shorter cache with public directive.
 */
export function staticCacheHeaders(req: Request, res: Response, next: NextFunction): void {
  const path = req.path.toLowerCase();
  const isHashed = /\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|png|jpg|webp|svg)$/i.test(path);
  const isImmutableFile = /\.(woff2?|ttf|otf)$/i.test(path);

  if (isHashed) {
    // Hashed content URLs — safe to cache for 1 year
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (isImmutableFile) {
    // Fonts rarely change
    res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
  } else if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(path)) {
    // Images — moderate cache
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
  } else if (/\.(css|js)$/i.test(path)) {
    // Non-hashed CSS/JS — short cache
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
  } else if (/\.(mp4|webm|mov)$/i.test(path)) {
    // Video files — moderate cache with revalidation
    res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate'); // 1 day
  } else {
    // Other static files
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }

  next();
}
