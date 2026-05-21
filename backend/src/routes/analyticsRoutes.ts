/**
 * analyticsRoutes.ts - Phase 11: Analytics API Routes
 */

import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController';
import { authenticateToken, optionalAuth } from '../middleware/auth';

const router = Router();

// Track events (can be called by both authenticated and anonymous users)
router.post('/track', optionalAuth, analyticsController.trackEvent);
router.post('/pageview', optionalAuth, analyticsController.trackPageView);

// Analytics dashboards (authenticated only)
router.get('/usage', authenticateToken, analyticsController.getUsageStats);
router.get('/costs', authenticateToken, analyticsController.getCostMetrics);
router.get('/dau', authenticateToken, analyticsController.getDAUTrend);
router.get('/endpoints', authenticateToken, analyticsController.getTopEndpoints);

// Cache metrics (admin)
router.get('/cache', authenticateToken, analyticsController.getCacheStats);

export default router;
