/**
 * auth.ts - JWT Authentication Middleware
 * MovieAnimation Backend - Phase 2 Auth
 * 
 * Extracts and verifies JWT from Authorization header.
 * Attaches decoded user payload to req.user.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';

export interface TokenPayload {
  id: number;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

/**
 * Authenticate JWT token from Authorization header
 * Format: Bearer <token>
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
    res.status(401).json({ error: 'Access token is required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.user = decoded;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token has expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(403).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
    return;
  }
};

/**
 * Optional authentication — attaches user if valid token, but doesn't block
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
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      req.user = decoded;
    } catch {
      // Token invalid — just proceed without user
    }
  }
  next();
};
