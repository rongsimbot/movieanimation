/**
 * authValidator.ts - Enhanced Input Validation for Auth Endpoints
 * MovieAnimation Backend - Phase 9: User Authentication
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

  if (body.name && body.name.trim().length > 100) {
    errors.push({ field: 'name', message: 'Name must be 100 characters or less' });
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
  } else if (body.password.length > 128) {
    errors.push({ field: 'password', message: 'Password must be 128 characters or less' });
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
    } else if (body.name.trim().length > 100) {
      errors.push({ field: 'name', message: 'Name must be 100 characters or less' });
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
 * Validate password reset completion input
 */
export function validatePasswordReset(body: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!body.token || typeof body.token !== 'string') {
    errors.push({ field: 'token', message: 'Reset token is required' });
  }

  if (!body.password || typeof body.password !== 'string') {
    errors.push({ field: 'password', message: 'New password is required' });
  } else if (body.password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  } else if (body.password.length > 128) {
    errors.push({ field: 'password', message: 'Password must be 128 characters or less' });
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
 * Validate password change (authenticated user changing their password)
 */
export function validateChangePassword(body: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!body.currentPassword || typeof body.currentPassword !== 'string') {
    errors.push({ field: 'currentPassword', message: 'Current password is required' });
  }

  if (!body.newPassword || typeof body.newPassword !== 'string') {
    errors.push({ field: 'newPassword', message: 'New password is required' });
  } else if (body.newPassword.length < 8) {
    errors.push({ field: 'newPassword', message: 'New password must be at least 8 characters' });
  } else if (body.newPassword.length > 128) {
    errors.push({ field: 'newPassword', message: 'New password must be 128 characters or less' });
  } else if (!/[A-Z]/.test(body.newPassword)) {
    errors.push({ field: 'newPassword', message: 'Password must contain at least one uppercase letter' });
  } else if (!/[a-z]/.test(body.newPassword)) {
    errors.push({ field: 'newPassword', message: 'Password must contain at least one lowercase letter' });
  } else if (!/[0-9]/.test(body.newPassword)) {
    errors.push({ field: 'newPassword', message: 'Password must contain at least one number' });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Basic email validation
 */
function isValidEmail(email: string): boolean {
  // RFC 5322 simplified
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Re-export validatePasswordChange for backwards compat
export const validatePasswordChange = validateChangePassword;
