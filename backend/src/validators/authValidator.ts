/**
 * authValidator.ts - Input Validation for Auth Endpoints
 * MovieAnimation Backend - Phase 2 Auth
 */

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate registration input
 */
export function validateRegisterInput(body: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 2) {
    errors.push({ field: 'name', message: 'Name must be at least 2 characters' });
  }

  if (!body.email || typeof body.email !== 'string') {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!isValidEmail(body.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }

  if (!body.password || typeof body.password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  } else if (body.password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  } else if (!/[A-Z]/.test(body.password)) {
    errors.push({ field: 'password', message: 'Password must contain at least one uppercase letter' });
  } else if (!/[a-z]/.test(body.password)) {
    errors.push({ field: 'password', message: 'Password must contain at least one lowercase letter' });
  } else if (!/[0-9]/.test(body.password)) {
    errors.push({ field: 'password', message: 'Password must contain at least one number' });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate login input
 */
export function validateLoginInput(body: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!body.email || typeof body.email !== 'string') {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!isValidEmail(body.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  }

  if (!body.password || typeof body.password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate profile update input
 */
export function validateProfileUpdate(body: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2) {
      errors.push({ field: 'name', message: 'Name must be at least 2 characters' });
    }
  }

  if (body.email !== undefined) {
    if (typeof body.email !== 'string' || !isValidEmail(body.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Basic email validation regex
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
