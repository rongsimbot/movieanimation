/**
 * authRoutes.ts - Authentication Routes
 * MovieAnimation Backend - Phase 2 Auth
 */

import { Router } from 'express';
import { register, login, me, updateProfile, deleteAccount } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes (require valid JWT)
router.get('/me', authenticateToken, me);
router.put('/profile', authenticateToken, updateProfile);
router.delete('/account', authenticateToken, deleteAccount);

export default router;
