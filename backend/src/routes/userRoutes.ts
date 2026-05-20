/**
 * userRoutes.ts - Protected User Routes
 * MovieAnimation Backend - Phase 2 Auth
 */

import { Router } from 'express';
import { getUserProfile, getUserDashboardData } from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All user routes require authentication
router.use(authenticateToken);

router.get('/profile', getUserProfile);
router.get('/dashboard', getUserDashboardData);

export default router;
