/**
 * userController.ts - Protected User Route Handlers
 * MovieAnimation Backend - Phase 2 Auth
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getCurrentUser, AppError } from '../services/authService';
import { getUserStats } from '../models/userModel';

/**
 * GET /api/users/profile
 * Get current user's detailed profile
 */
export const getUserProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
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
 * GET /api/users/dashboard
 * Get user dashboard with real database stats
 */
export const getUserDashboardData = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await getCurrentUser(userId);
    const stats = await getUserStats(userId);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        joinedAt: user.created_at,
      },
      stats: {
        scriptsUploaded: stats.projectsCreated,
        animationsGenerated: stats.animationsGenerated,
        storageUsed: stats.totalStorageBytes > 0
          ? `${(stats.totalStorageBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
          : '0 GB',
        creditsRemaining: 120, // Hardcoded for now; Phase 4 will track real credits
        activeJobs: 0, // Phase 4 will track via Redis queue
      },
      recentActivity: [
        {
          type: 'account_created',
          description: 'Account created',
          date: user.created_at,
        },
      ],
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};
