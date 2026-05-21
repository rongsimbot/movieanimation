/**
 * userController.ts - Protected User Route Handlers
 * MovieAnimation Backend - Phase 2 Auth, Phase 7 Polish
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getCurrentUser, AppError } from '../services/authService';
import { getUserStats } from '../models/userModel';
import { apiCache } from '../services/cacheService';
import pool from '../config/database';

// ─── Helpers ─────────────────────────────────────────────────────

function toISO(date: Date | string): string {
  if (typeof date === 'string') return date;
  return new Date(date).toISOString();
}

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
 * Phase 7: Enhanced with richer activity feed and caching
 */
export const getUserDashboardData = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check cache first (15 second TTL for dashboard)
    const cacheKey = `dashboard:${userId}`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const user = await getCurrentUser(userId);
    const stats = await getUserStats(userId);

    // Fetch recent activity from analytics for this user
    let recentActivity: Array<{ type: string; description: string; date: string }> = [];
    try {
      const activityResult = await pool.query(
        `SELECT event_type, metadata, created_at 
         FROM analytics_events 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [userId]
      );
      
      recentActivity = activityResult.rows.map((row: any) => {
        const meta = row.metadata || {};
        let description = '';
        switch (row.event_type) {
          case 'page_view': description = `Viewed ${meta.page || 'a page'}`; break;
          case 'script_created': description = `Created script "${meta.title || 'Untitled'}"`; break;
          case 'script_parsed': description = `Parsed script with AI`; break;
          case 'video_generated': description = `Generated video via ${meta.api || 'AI'}`; break;
          case 'asset_uploaded': description = `Uploaded ${meta.count || 'assets'}`; break;
          case 'timeline_created': description = `Created timeline`; break;
          case 'export_completed': description = `Export completed: ${meta.name || 'video'}`; break;
          case 'login': description = `Logged in`; break;
          default: description = row.event_type.replace(/_/g, ' ');
        }
        return {
          type: row.event_type,
          description,
          date: row.created_at,
        };
      });

      // Fall back to basic activity if no analytics data
      if (recentActivity.length === 0) {
        recentActivity = [{
          type: 'account_created',
          description: 'Account created',
          date: toISO(user.created_at),
        }];
      }
    } catch {
      // Analytics table might not exist yet
      recentActivity = [{
        type: 'account_created',
        description: 'Account created',
        date: toISO(user.created_at),
      }];
    }

    // Compute active jobs count
    let activeJobs = 0;
    try {
      const jobsResult = await pool.query(
        `SELECT COUNT(*) as count FROM video_clips 
         WHERE user_id = $1 AND status IN ('pending', 'processing')`,
        [userId]
      );
      activeJobs = parseInt(jobsResult.rows[0]?.count || '0', 10);
    } catch {
      activeJobs = 0;
    }

    const dashboardData = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        joinedAt: toISO(user.created_at),
      },
      stats: {
        scriptsUploaded: stats.projectsCreated,
        animationsGenerated: stats.animationsGenerated,
        storageUsed: stats.totalStorageBytes > 0
          ? `${(stats.totalStorageBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
          : '0 GB',
        creditsRemaining: 120,
        activeJobs,
      },
      recentActivity,
    };

    // Cache for 15 seconds
    apiCache.set(cacheKey, dashboardData, 15_000);

    res.json(dashboardData);
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};
