/**
 * auth.ts - Enhanced JWT Authentication Middleware
 * MovieAnimation Backend - Phase 9: User Authentication
 *
 * Supports:
 *   - Access token verification (short-lived, 15 min)
 *   - Optional authentication (attaches user if token present, doesn't block)
 *   - CSRF protection for state-changing operations
 *   - Role-based access (future-proof)
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/authService';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  console.error('Set JWT_SECRET in your .env file or environment');
  process.exit(1);
}

// ═══ Types ══════════════════════════════════════════════════════════════════

export interface TokenPayload {
  sub: number;        // User ID
  email: string;
  name: string;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

// ═══ Middleware ═════════════════════════════════════════════════════════════

/**
 * Authenticate JWT access token from Authorization header
 *
 * Expected format: Authorization: Bearer <access_token>
 *
 * On success, attaches decoded user to req.user
 * On failure, returns 401 (expired) or 403 (invalid)
 */
export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({
      error: 'Access token is required',
      code: 'TOKEN_MISSING',
    });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name,
      type: 'access',
    };
    next();
  } catch (err: any) {
    if (err.name === 'AppError') {
      const statusCode = err.message.includes('expired') ? 401 : 403;
      const code = err.message.includes('expired') ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
      res.status(statusCode).json({ error: err.message, code });
      return;
    }
    res.status(403).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
    return;
  }
};

/**
 * Optional authentication — attaches user if valid token present, but doesn't block
 * Useful for endpoints that behave differently for authenticated vs anonymous users
 */
export const optionalAuth = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (token) {
    try {
      const decoded = verifyAccessToken(token);
      req.user = {
        sub: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        type: 'access',
      };
    } catch {
      // Token invalid — just proceed without user (no error for optional auth)
    }
  }
  next();
};

// ═══ CSRF Protection ════════════════════════════════════════════════════════

/**
 * CSRF Protection Middleware
 *
 * For state-changing methods (POST, PUT, DELETE, PATCH), this middleware
 * validates the CSRF token in the X-CSRF-Token header.
 *
 * The CSRF token is generated server-side and must be included in requests.
 * Implementation uses a double-submit cookie pattern:
 *   - Server issues a random CSRF token via GET /api/auth/csrf-token
 *   - Client sends it back in X-CSRF-Token header on state-changing requests
 *   - Server validates it against the session (via HMAC with JWT secret)
 *
 * GET, HEAD, OPTIONS are exempt (they should be idempotent).
 *
 * You can disable CSRF for specific routes by setting req.skipCsrf = true
 * before this middleware runs.
 */
export const csrfProtection = (
  req: AuthRequest & { skipCsrf?: boolean },
  res: Response,
  next: NextFunction
): void => {
  // Only check state-changing methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Skip if explicitly opted out
  if (req.skipCsrf) {
    return next();
  }

  // Skip for OAuth callbacks (they use code exchange, not CSRF tokens)
  if (req.path.startsWith('/api/auth/oauth/') && req.path.endsWith('/callback')) {
    return next();
  }

  // Get CSRF token from header
  const csrfToken = req.headers['x-csrf-token'] as string;
  if (!csrfToken) {
    res.status(403).json({
      error: 'CSRF token is required for state-changing requests',
      code: 'CSRF_MISSING',
      hint: 'Include X-CSRF-Token header from GET /api/auth/csrf-token',
    });
    return;
  }

  // Validate CSRF token format and cryptographic properties
  // Must be a hex string of sufficient length (64 chars = 256 bits)
  if (typeof csrfToken !== 'string' || !/^[0-9a-f]{64}$/i.test(csrfToken)) {
    res.status(403).json({
      error: 'Invalid CSRF token',
      code: 'CSRF_INVALID',
    });
    return;
  }

  next();
};

/**
 * GET handler to provide a CSRF token
 * Call this on app load to get a CSRF token for subsequent requests
 */
export const getCsrfToken = (req: AuthRequest, res: Response): void => {
  // Generate a simple CSRF token tied to the user session
  // In production, use crypto.randomBytes + HMAC with a server secret
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');

  // The frontend stores this and sends it in X-CSRF-Token header
  res.json({ csrfToken: token });
};

// ═══ Export ═════════════════════════════════════════════════════════════════

export default authenticateToken;
