/**
 * queueController.ts - Job Queue API Controller
 * MovieAnimation Backend - Phase 4 Redis Job Queue
 *
 * REST API for job tracking, dead letter queue management,
 * and queue health monitoring.
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as jobModel from '../models/jobModel';
import { videoQueue, sceneQueue } from '../queue/videoQueue';
import { scriptQueue } from '../queue/scriptQueue';
import { assetQueue } from '../queue/assetQueue';
import { assemblyQueue } from '../queue/assemblyQueue';
import { exportQueue } from '../queue/exportQueue';
import { progressService } from '../services/progressService';

// ─── Queue Registry ───────────────────────────────────────────────────────

const QUEUE_MAP: Record<string, any> = {
  'video-generation': videoQueue,
  'scene-generation': sceneQueue,
  'script-parsing': scriptQueue,
  'asset-processing': assetQueue,
  'video-assembly': assemblyQueue,
  'movieanimation-exports': exportQueue,
};

function getQueue(name: string) {
  const q = QUEUE_MAP[name];
  if (!q) throw new Error(`Unknown queue: ${name}`);
  return q;
}

// ─── Job Tracking Endpoints ───────────────────────────────────────────────

/**
 * GET /api/queue/jobs
 * List all tracked jobs with filters.
 */
export async function listJobs(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : req.user?.sub;
  const filters: jobModel.JobListFilters = {
    userId: userId || undefined,
    projectId: req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined,
    sceneId: req.query.sceneId ? parseInt(req.query.sceneId as string, 10) : undefined,
    queueName: req.query.queueName as string | undefined,
    status: req.query.status as jobModel.JobStatus | undefined,
    jobType: req.query.jobType as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    orderBy: req.query.orderBy as string | undefined,
  };

  const result = await jobModel.listJobs(filters);
  res.json({ success: true, ...result });
}

/**
 * GET /api/queue/jobs/:jobId
 * Get a single job by its BullMQ job ID.
 */
export async function getJob(req: AuthRequest, res: Response): Promise<void> {
  const job = await jobModel.getJobByJobId(req.params.jobId);
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found', code: 'NOT_FOUND' });
    return;
  }
  res.json({ success: true, job });
}

/**
 * GET /api/queue/jobs/:jobId/progress
 * Get real-time progress for a job (DB + SSE state).
 */
export async function getJobProgress(req: AuthRequest, res: Response): Promise<void> {
  const job = await jobModel.getJobByJobId(req.params.jobId);
  if (!job) {
    res.status(404).json({ success: false, error: 'Job not found', code: 'NOT_FOUND' });
    return;
  }

  const progress = progressService.getJobProgress(job.job_id);

  res.json({
    success: true,
    jobId: job.job_id,
    status: job.status,
    progress: job.progress,
    state: progress?.state || job.status,
    message: progress?.message || null,
    metadata: progress?.metadata || {},
    startedAt: job.started_at,
    completedAt: job.completed_at,
    estimatedDurationSec: job.estimated_duration_sec,
    actualDurationSec: job.actual_duration_sec,
  });
}

/**
 * POST /api/queue/jobs/:jobId/cancel
 * Cancel a queued or delayed job.
 */
export async function cancelJob(req: AuthRequest, res: Response): Promise<void> {
  const { jobId } = req.params;

  let cancelled = false;
  for (const [queueName, queue] of Object.entries(QUEUE_MAP)) {
    try {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state === 'waiting' || state === 'delayed') {
          await job.remove();
          cancelled = true;
        }
        break;
      }
    } catch (e) {
      // Continue to next queue
    }
  }

  await jobModel.updateJobStatus(jobId, {
    status: 'cancelled',
    completed_at: new Date().toISOString(),
  });

  res.json({
    success: true,
    cancelled,
    message: cancelled ? 'Job cancelled and removed from queue' : 'Job status updated but could not be removed from queue',
  });
}

/**
 * GET /api/queue/jobs/stats
 * Get job statistics.
 */
export async function getStats(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.sub;
  const stats = await jobModel.getJobStats(userId);
  const queueStats = await jobModel.getQueueStats();

  // Get live BullMQ queue counts
  const liveCounts: Record<string, any> = {};
  for (const [name, queue] of Object.entries(QUEUE_MAP)) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      liveCounts[name] = { waiting, active, completed, failed, delayed };
    } catch (e) {
      liveCounts[name] = { error: 'Queue unavailable' };
    }
  }

  res.json({
    success: true,
    dbStats: stats,
    queueStats,
    liveCounts,
  });
}

// ─── Dead Letter Queue Endpoints ──────────────────────────────────────────

/**
 * GET /api/queue/dead-letters
 * List dead letter queue entries.
 */
export async function listDeadLetters(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user?.sub;
  const filters: jobModel.DLQListFilters = {
    userId: req.query.userId ? parseInt(req.query.userId as string, 10) : userId,
    projectId: req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined,
    queueName: req.query.queueName as string | undefined,
    status: req.query.status as jobModel.DLQStatus | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
  };

  const result = await jobModel.listDeadLetters(filters);
  res.json({ success: true, ...result });
}

/**
 * POST /api/queue/dead-letters/:id/retry
 * Re-queue a failed job from the dead letter queue.
 */
export async function retryDeadLetter(req: AuthRequest, res: Response): Promise<void> {
  const dlqId = parseInt(req.params.id, 10);
  if (isNaN(dlqId)) {
    res.status(400).json({ success: false, error: 'Invalid dead letter ID', code: 'VALIDATION' });
    return;
  }

  const { entries } = await jobModel.listDeadLetters({ limit: 1 });
  const entry = entries.find(e => e.id === dlqId);
  if (!entry) {
    res.status(404).json({ success: false, error: 'Dead letter entry not found', code: 'NOT_FOUND' });
    return;
  }

  await jobModel.retryDeadLetter(dlqId);

  const queue = QUEUE_MAP[entry.queue_name];
  if (queue) {
    await queue.add(entry.job_type, entry.original_data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  } else {
    res.status(400).json({ success: false, error: `Unknown queue: ${entry.queue_name}`, code: 'VALIDATION' });
    return;
  }

  res.json({ success: true, message: 'Job re-queued from dead letter queue' });
}

/**
 * POST /api/queue/dead-letters/:id/resolve
 * Resolve/acknowledge a dead letter entry.
 */
export async function resolveDeadLetter(req: AuthRequest, res: Response): Promise<void> {
  const dlqId = parseInt(req.params.id, 10);
  const { notes } = req.body;

  if (isNaN(dlqId)) {
    res.status(400).json({ success: false, error: 'Invalid dead letter ID', code: 'VALIDATION' });
    return;
  }

  const entry = await jobModel.resolveDeadLetter(dlqId, notes);
  if (!entry) {
    res.status(404).json({ success: false, error: 'Dead letter entry not found', code: 'NOT_FOUND' });
    return;
  }

  res.json({ success: true, entry });
}

/**
 * POST /api/queue/dead-letters/:id/discard
 * Discard a dead letter entry permanently.
 */
export async function discardDeadLetter(req: AuthRequest, res: Response): Promise<void> {
  const dlqId = parseInt(req.params.id, 10);
  if (isNaN(dlqId)) {
    res.status(400).json({ success: false, error: 'Invalid dead letter ID', code: 'VALIDATION' });
    return;
  }

  const entry = await jobModel.discardDeadLetter(dlqId);
  if (!entry) {
    res.status(404).json({ success: false, error: 'Dead letter entry not found', code: 'NOT_FOUND' });
    return;
  }

  res.json({ success: true, entry });
}

// ─── Queue Health Endpoints ───────────────────────────────────────────────

/**
 * GET /api/queue/health
 * Get health snapshots for all queues (latest).
 */
export async function getQueueHealth(req: AuthRequest, res: Response): Promise<void> {
  const { queueName } = req.query;

  const snapshots = await jobModel.getQueueHealth(queueName as string | undefined);

  const liveQueues: any[] = [];
  for (const [name, queue] of Object.entries(QUEUE_MAP)) {
    if (queueName && name !== queueName) continue;

    try {
      const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
        queue.getWaitingCount().catch(() => 0),
        queue.getActiveCount().catch(() => 0),
        queue.getCompletedCount().catch(() => 0),
        queue.getFailedCount().catch(() => 0),
        queue.getDelayedCount().catch(() => 0),
        queue.isPaused().catch(() => false),
      ]);

      liveQueues.push({
        name,
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused: isPaused,
        status: isPaused ? 'paused' : (active > 0 ? 'active' : 'idle'),
      });
    } catch (e) {
      liveQueues.push({ name, status: 'error', error: 'Queue unavailable' });
    }
  }

  res.json({
    success: true,
    queues: liveQueues,
    snapshots,
  });
}

/**
 * GET /api/queue/health/history
 * Get historical health data for a queue.
 */
export async function getQueueHealthHistory(req: AuthRequest, res: Response): Promise<void> {
  const queueName = req.query.queueName as string;
  if (!queueName) {
    res.status(400).json({ success: false, error: 'queueName query parameter required', code: 'VALIDATION' });
    return;
  }

  const hours = req.query.hours ? parseInt(req.query.hours as string, 10) : 24;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

  const history = await jobModel.getQueueHealthHistory(queueName, hours, limit);
  res.json({ success: true, queueName, hours, count: history.length, history });
}

/**
 * POST /api/queue/health/snapshot
 * Trigger a manual health snapshot for all queues.
 */
export async function triggerHealthSnapshot(req: AuthRequest, res: Response): Promise<void> {
  const results: any[] = [];

  for (const [name, queue] of Object.entries(QUEUE_MAP)) {
    try {
      const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
        queue.getWaitingCount().catch(() => 0),
        queue.getActiveCount().catch(() => 0),
        queue.getCompletedCount().catch(() => 0),
        queue.getFailedCount().catch(() => 0),
        queue.getDelayedCount().catch(() => 0),
        queue.isPaused().catch(() => false),
      ]);

      const snapshot = await jobModel.saveQueueHealth(name, {
        waiting, active, completed, failed, delayed,
        paused: isPaused,
        worker_count: active,
      });

      results.push(snapshot);
    } catch (e: any) {
      results.push({ queue_name: name, error: e.message });
    }
  }

  res.json({ success: true, snapshots: results });
}

/**
 * POST /api/queue/:queueName/pause
 * Pause a queue.
 */
export async function pauseQueue(req: AuthRequest, res: Response): Promise<void> {
  const queue = getQueue(req.params.queueName);
  await queue.pause();
  res.json({ success: true, message: `Queue ${req.params.queueName} paused` });
}

/**
 * POST /api/queue/:queueName/resume
 * Resume a paused queue.
 */
export async function resumeQueue(req: AuthRequest, res: Response): Promise<void> {
  const queue = getQueue(req.params.queueName);
  await queue.resume();
  res.json({ success: true, message: `Queue ${req.params.queueName} resumed` });
}

/**
 * POST /api/queue/:queueName/drain
 * Remove all waiting/delayed jobs from a queue.
 */
export async function drainQueue(req: AuthRequest, res: Response): Promise<void> {
  const queue = getQueue(req.params.queueName);
  await queue.drain();
  res.json({ success: true, message: `Queue ${req.params.queueName} drained` });
}

/**
 * POST /api/queue/:queueName/clean
 * Clean completed/failed jobs older than N hours.
 */
export async function cleanQueue(req: AuthRequest, res: Response): Promise<void> {
  const queue = getQueue(req.params.queueName);
  const grace = req.body.grace || 3600000; // 1 hour default
  const limit = req.body.limit || 1000;

  const cleaned = await Promise.all([
    queue.clean(grace, limit, 'completed'),
    queue.clean(grace, limit, 'failed'),
  ]);

  res.json({
    success: true,
    message: 'Queue cleaned',
    cleaned: { completed: cleaned[0].length, failed: cleaned[1].length },
  });
}
