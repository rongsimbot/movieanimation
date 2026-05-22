/**
 * exportQueue.ts - Export Job Queue (BullMQ)
 * MovieAnimation Backend - Phase 8 Final Rendering & Export Pipeline
 *
 * Manages async FFmpeg rendering jobs with:
 * - DB-backed progress tracking
 * - Share link auto-generation on completion
 * - Webhook notification support
 * - Cleanup of expired exports
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { exportVideo, ExportOptions, ExportProgress, ExportResult, probeVideo, generateOutputPath, formatFileSize } from '../services/videoExport';
import * as exportModel from '../models/exportModel';
import path from 'path';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy: (times: number) => {
    if (times > 10) return null;
    return Math.min(times * 200, 3000);
  },
});

// ─── Queue ──────────────────────────────────────────────────────

export const exportQueue = new Queue('movieanimation-exports', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 3600 },     // Keep completed jobs 24h
    removeOnFail: { age: 7 * 24 * 3600 },      // Keep failed jobs 7 days
  },
});

// ─── Job Data Types ─────────────────────────────────────────────

export interface ExportJobData {
  exportId: number;
  userId: number;
  options: ExportOptions;
  webhookUrl?: string;
}

// ─── Add Export Job ─────────────────────────────────────────────

export async function addExportJob(
  userId: number,
  exportId: number,
  options: ExportOptions,
  webhookUrl?: string
): Promise<{ jobId: string; exportId: number }> {
  const job = await exportQueue.add('render-export', {
    exportId,
    userId,
    options,
    webhookUrl,
  } as ExportJobData, {
    jobId: `export-${exportId}`,
  });

  // Update DB with job ID
  await exportModel.updateExportStatus(exportId, {
    job_id: job.id || undefined,
    status: 'queued',
  });

  // Log the queued event
  await exportModel.createExportLog(exportId, {
    job_id: job.id || undefined,
    status: 'queued',
    progress: 0,
    stage: 'queued',
    message: 'Export job added to queue',
  });

  return { jobId: job.id || `export-${exportId}`, exportId };
}

// ─── Worker ─────────────────────────────────────────────────────

export const exportWorker = new Worker<ExportJobData>(
  'movieanimation-exports',
  async (job: Job<ExportJobData>) => {
    const { exportId, userId, options, webhookUrl } = job.data;

    console.log(`[ExportWorker] Processing export #${exportId} for user #${userId}`);
    console.log(`[ExportWorker] Resolution: ${options.resolution}, Format: ${options.format}`);

    // Update DB: processing
    await exportModel.updateExportStatus(exportId, {
      status: 'processing',
      started_at: new Date(),
    });

    await job.updateProgress(5);
    await exportModel.createExportLog(exportId, {
      job_id: job.id,
      status: 'processing',
      progress: 5,
      stage: 'probe',
      message: 'Probing input video...',
    });

    try {
      // Phase 1: Probe input
      const probe = await probeVideo(options.inputPath);
      console.log(`[ExportWorker] Input: ${probe.width}x${probe.height}, ${probe.duration}s, audio: ${probe.hasAudio}`);

      await job.updateProgress(10);
      await exportModel.createExportLog(exportId, {
        job_id: job.id,
        status: 'processing',
        progress: 10,
        stage: 'probe',
        message: `Input: ${probe.width}x${probe.height}, ${Math.round(probe.duration)}s`,
      });

      // Phase 2: Export with progress
      const result: ExportResult = await exportVideo(
        options,
        // Progress callback
        (progress: ExportProgress) => {
          // Map FFmpeg 0-100% to job 10-90%
          const jobProgress = 10 + Math.floor(progress.percent * 0.8);
          job.updateProgress(jobProgress).catch(() => {});

          // Log major milestones
          if (progress.percent > 0 && progress.percent % 25 < 1) {
            exportModel.createExportLog(exportId, {
              job_id: job.id,
              progress: jobProgress,
              stage: 'encoding',
              message: `Encoding: ${progress.percent}% at ${progress.fps}fps`,
            }).catch(() => {});
          }
        },
        // Stage callback
        (stage: string) => {
          exportModel.createExportLog(exportId, {
            job_id: job.id,
            stage,
            message: `Entering stage: ${stage}`,
          }).catch(() => {});
        }
      );

      // Phase 3: Finalize
      await job.updateProgress(95);
      await exportModel.createExportLog(exportId, {
        job_id: job.id,
        progress: 95,
        stage: 'finalize',
        message: `Render complete: ${exportModel.FORMAT_CONFIGS[result.format]?.ext || result.format}`,
      });

      // Update DB with result
      const filename = path.basename(result.outputPath);
      await exportModel.updateExportStatus(exportId, {
        status: 'completed',
        progress: 100,
        output_path: result.outputPath,
        output_filename: filename,
        output_size_bytes: result.outputSizeBytes,
        output_duration_seconds: result.durationSeconds,
        ffmpeg_command: result.ffmpegCommand.substring(0, 2000), // Truncate for DB
        completed_at: new Date(),
      });

      await job.updateProgress(100);
      await exportModel.createExportLog(exportId, {
        job_id: job.id,
        progress: 100,
        status: 'completed',
        stage: 'complete',
        message: `Export completed: ${formatFileSize(result.outputSizeBytes)}`,
        duration_ms: Math.round(result.durationSeconds * 1000),
      });

      console.log(`[ExportWorker] Export #${exportId} completed: ${result.outputFilename}`);
      return {
        status: 'success',
        exportId,
        ...result,
      };
    } catch (error: any) {
      console.error(`[ExportWorker] Export #${exportId} failed:`, error.message);

      // Update DB with error
      await exportModel.updateExportStatus(exportId, {
        status: 'failed',
        error_message: error.message,
        completed_at: new Date(),
      });

      await exportModel.createExportLog(exportId, {
        job_id: job.id,
        status: 'failed',
        stage: 'error',
        message: error.message,
      });

      throw error; // Re-throw for BullMQ retry
    }
  },
  {
    connection,
    concurrency: 2, // Limit concurrent FFmpeg jobs
    limiter: {
      max: 5,        // Max 5 jobs
      duration: 60000, // Per minute
    },
  }
);

// ─── Worker Events ──────────────────────────────────────────────

exportWorker.on('completed', async (job, result) => {
  console.log(`[ExportQueue] Job ${job.id} completed: export #${job.data.exportId}`);

  // Trigger webhook if configured
  if (job.data.webhookUrl) {
    try {
      const axios = require('axios');
      await axios.post(job.data.webhookUrl, {
        jobId: job.id,
        exportId: job.data.exportId,
        status: 'completed',
        result,
      });
    } catch (e: any) {
      console.warn(`[ExportQueue] Webhook delivery failed: ${e.message}`);
    }
  }
});

exportWorker.on('failed', async (job, err) => {
  console.error(`[ExportQueue] Job ${job?.id} failed:`, err.message);

  if (job?.data.webhookUrl) {
    try {
      const axios = require('axios');
      await axios.post(job.data.webhookUrl, {
        jobId: job?.id,
        exportId: job?.data.exportId,
        status: 'failed',
        error: err.message,
      });
    } catch {}
  }
});

// ─── Periodic Cleanup ──────────────────────────────────────────

let cleanupInterval: NodeJS.Timeout | null = null;

export function startExportCleanup(intervalMs: number = 60 * 60 * 1000): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(async () => {
    try {
      const result = await exportModel.cleanupExpiredExports();
      if (result.exportsExpired > 0 || result.linksExpired > 0) {
        console.log(`[ExportCleanup] Expired ${result.exportsExpired} exports and ${result.linksExpired} share links`);
      }
    } catch (err: any) {
      console.error('[ExportCleanup] Cleanup error:', err.message);
    }
  }, intervalMs);

  console.log(`[ExportCleanup] Started (interval: ${intervalMs / 1000}s)`);
}

export function stopExportCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// ─── Queue Status ───────────────────────────────────────────────

export async function getQueueStatus(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    exportQueue.getWaitingCount(),
    exportQueue.getActiveCount(),
    exportQueue.getCompletedCount(),
    exportQueue.getFailedCount(),
    exportQueue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

// ─── Graceful Shutdown ──────────────────────────────────────────

export async function closeExportQueue(): Promise<void> {
  stopExportCleanup();
  await exportWorker.close();
  await exportQueue.close();
  await connection.quit();
  console.log('[ExportQueue] Queue and worker closed');
}
