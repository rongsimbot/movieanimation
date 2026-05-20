/**
 * authController.ts - Authentication Route Handlers
 * MovieAnimation Backend - Phase 2 Auth
 * 
 * Handles user registration, login, and session management
 * with real PostgreSQL database via the auth service.
 */

import { Request, Response, NextFunction } from 'express';
import { registerUser, loginUser, getCurrentUser, AppError } from '../services/authService';
import { updateUser, deleteUser } from '../models/userModel';
import {
  validateRegisterInput,
  validateLoginInput,
  validateProfileUpdate,
} from '../validators/authValidator';
import { AuthRequest } from '../middleware/auth';

/**
 * POST /api/auth/register
 * Register a new user account
 */
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate input
    const validation = validateRegisterInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    const { name, email, password } = req.body;
    const result = await registerUser(name.trim(), email, password);

    res.status(201).json({
      message: 'Registration successful',
      user: result.user,
      tokens: result.tokens,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate input
    const validation = validateLoginInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    const { email, password } = req.body;
    const result = await loginUser(email, password);

    res.json({
      message: 'Login successful',
      user: result.user,
      tokens: result.tokens,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * GET /api/auth/me
 * Get current authenticated user's profile
 */
export const me = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await getCurrentUser(userId);
    res.json({ user });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * PUT /api/auth/profile
 * Update authenticated user's profile
 */
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const validation = validateProfileUpdate(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    const { name, email } = req.body;
    const updated = await updateUser(userId, { name, email });

    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: updated,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * DELETE /api/auth/account
 * Delete authenticated user's account
 */
export const deleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const deleted = await deleteUser(userId);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};
