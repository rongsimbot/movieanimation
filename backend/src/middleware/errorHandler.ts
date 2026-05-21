/**
 * errorHandler.ts - Phase 11: Enhanced Error Handling Middleware
 * 
 * Provides structured error responses with:
 * - Standardized error codes
 * - Request ID tracking for debugging
 * - Validation error formatting
 * - Production-safe error messages (no stack traces leak)
 * - Different handling for known vs unknown errors
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// ─── Error Codes ────────────────────────────────────────────────

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT = 'RATE_LIMIT',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  FILE_UPLOAD_ERROR = 'FILE_UPLOAD_ERROR',
}

// ─── Custom Error Classes ────────────────────────────────────────

export class AppError extends Error {
  public statusCode: number;
  public code: ErrorCode;
  public details?: any;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, ErrorCode.AUTHENTICATION_ERROR);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, ErrorCode.AUTHORIZATION_ERROR);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, ErrorCode.NOT_FOUND);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

// ─── Request ID Middleware ───────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = (req.headers['x-request-id'] as string) || uuidv4();
  next();
}

// ─── Global Error Handler ────────────────────────────────────────

export function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';

  // Determine if it's our custom error
  if (err instanceof AppError) {
    // Log operational errors at debug level
    if (err.statusCode >= 500) {
      console.error(`[${requestId}] ${err.code}: ${err.message}`, err.details || '');
    } else {
      console.warn(`[${requestId}] ${err.code}: ${err.message}`);
    }

    const response: any = {
      error: err.message,
      code: err.code,
      requestId,
    };

    if (err.details) {
      response.details = err.details;
    }

    // Only include stack trace in development
    if (process.env.NODE_ENV === 'development' && err.stack) {
      response.stack = err.stack;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle multer file size errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      error: 'File too large',
      code: ErrorCode.FILE_UPLOAD_ERROR,
      requestId,
      details: { maxSize: '50MB' },
    });
    return;
  }

  // Handle JSON parse errors
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({
      error: 'Invalid JSON in request body',
      code: ErrorCode.VALIDATION_ERROR,
      requestId,
    });
    return;
  }

  // Unknown / unexpected errors
  console.error(`[${requestId}] UNEXPECTED ERROR:`, err.message);
  console.error(err.stack);

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: isProduction ? 'Internal server error' : err.message,
    code: ErrorCode.INTERNAL_ERROR,
    requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

// ─── 404 Handler ─────────────────────────────────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
    code: ErrorCode.NOT_FOUND,
    requestId: req.requestId || 'unknown',
  });
}

// ─── Async Handler Wrapper ──────────────────────────────────────

/** Wraps async route handlers to catch errors and pass to next() */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
