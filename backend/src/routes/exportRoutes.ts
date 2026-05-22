/**
 * exportRoutes.ts - Export & Share API Routes
 * MovieAnimation Backend - Phase 8 Final Rendering & Export Pipeline
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import * as exportController from '../controllers/exportController';

const router = Router();

// ─── Public routes (no auth required) ───────────────────────────

// Share link access (public)
router.get('/share/:token', exportController.accessSharedExport);
router.get('/share/:token/download', rateLimiter({ maxRequests: 10, windowMs: 60000 }), exportController.downloadSharedExport);

// Resolution/format options (public for available options)
router.get('/options', exportController.getResolutionOptions);

// ─── Authenticated routes ──────────────────────────────────────

// Export CRUD
router.post('/', authenticateToken, exportController.createExport);
router.get('/', authenticateToken, exportController.listExports);
router.get('/queue/status', authenticateToken, exportController.getExportQueueStatus);
router.get('/:id', authenticateToken, exportController.getExport);
router.get('/:id/download', authenticateToken, exportController.downloadExport);
router.delete('/:id', authenticateToken, exportController.deleteExport);

// Share link management
router.post('/:id/share', authenticateToken, exportController.createShareLink);
router.get('/:id/shares', authenticateToken, exportController.getShareLinks);
router.delete('/:id/shares/:token', authenticateToken, exportController.revokeShareLink);

export default router;
