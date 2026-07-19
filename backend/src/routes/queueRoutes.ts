/**
 * queueRoutes.ts - Job Queue API Routes
 * MovieAnimation Backend - Phase 4 Redis Job Queue
 */

import { Router } from 'express';
import {
  listJobs,
  getJob,
  getJobProgress,
  cancelJob,
  getStats,
  listDeadLetters,
  retryDeadLetter,
  resolveDeadLetter,
  discardDeadLetter,
  getQueueHealth,
  getQueueHealthHistory,
  triggerHealthSnapshot,
  pauseQueue,
  resumeQueue,
  drainQueue,
  cleanQueue,
} from '../controllers/queueController';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// All queue routes require authentication
router.use(authenticateToken);

// ─── Job Tracking ─────────────────────────────────────────────────────────

router.get('/jobs', asyncHandler(listJobs));
router.get('/jobs/stats', asyncHandler(getStats));
router.get('/jobs/:jobId', asyncHandler(getJob));
router.get('/jobs/:jobId/progress', asyncHandler(getJobProgress));
router.post('/jobs/:jobId/cancel', asyncHandler(cancelJob));

// ─── Dead Letter Queue ────────────────────────────────────────────────────

router.get('/dead-letters', asyncHandler(listDeadLetters));
router.post('/dead-letters/:id/retry', asyncHandler(retryDeadLetter));
router.post('/dead-letters/:id/resolve', asyncHandler(resolveDeadLetter));
router.post('/dead-letters/:id/discard', asyncHandler(discardDeadLetter));

// ─── Queue Health & Management ────────────────────────────────────────────

router.get('/health', asyncHandler(getQueueHealth));
router.get('/health/history', asyncHandler(getQueueHealthHistory));
router.post('/health/snapshot', asyncHandler(triggerHealthSnapshot));
router.post('/:queueName/pause', asyncHandler(pauseQueue));
router.post('/:queueName/resume', asyncHandler(resumeQueue));
router.post('/:queueName/drain', asyncHandler(drainQueue));
router.post('/:queueName/clean', asyncHandler(cleanQueue));

export default router;
