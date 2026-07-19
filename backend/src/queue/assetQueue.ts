/**
 * assetQueue.ts - Asset Processing Job Queue
 * MovieAnimation Backend - Phase 4 Redis Job Queue
 *
 * Handles image/asset processing (thumbnails, face detection prep,
 * format validation, optimization) as async background jobs.
 * Integrates with job tracking database.
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import * as jobModel from '../models/jobModel';
import fs from 'fs';
import path from 'path';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export interface AssetJobData {
  assetUrl: string;
  assetType: 'character_photo' | 'prop' | 'background' | 'reference';
  userId: number;
  projectId?: number;
  assetId?: number;
  options?: {
    generateThumbnail?: boolean;
    faceDetection?: boolean;
    optimize?: boolean;
  };
  webhookUrl?: string;
}

// ─── Queue ────────────────────────────────────────────────────────────────

export const assetQueue = new Queue('asset-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: false,
  },
});

// ─── Add Job ──────────────────────────────────────────────────────────────

export async function addAssetJob(data: AssetJobData) {
  const job = await assetQueue.add('process-asset', data);

  // Create DB tracking entry
  await jobModel.createJobLog({
    job_id: job.id!,
    queue_name: 'asset-processing',
    job_type: 'process-asset',
    user_id: data.userId,
    project_id: data.projectId,
    status: 'pending',
    data: {
      assetUrl: data.assetUrl,
      assetType: data.assetType,
      options: data.options || {},
    },
    max_attempts: 3,
    webhook_url: data.webhookUrl,
    estimated_duration_sec: 15,
    tags: [
      `type:${data.assetType}`,
      ...(data.projectId ? [`project:${data.projectId}`] : []),
    ],
  });

  return job;
}

// ─── Worker ───────────────────────────────────────────────────────────────

export const assetWorker = new Worker('asset-processing', async (job: Job<AssetJobData>) => {
  const { assetUrl, assetType, userId, projectId, options, webhookUrl } = job.data;
  const jobId = job.id!;
  const startTime = Date.now();

  console.log(`[AssetWorker] Job ${jobId} — Processing ${assetType}: ${assetUrl.substring(0, 60)}...`);

  // Track start
  await jobModel.updateJobStatus(jobId, {
    status: 'active',
    progress: 5,
    attempts: job.attemptsMade,
    started_at: new Date().toISOString(),
  });

  await job.updateProgress(5);

  try {
    const result: any = {
      originalUrl: assetUrl,
      assetType,
      processed: false,
      thumbnailUrl: null,
      isValid: false,
      metadata: {},
    };

    // Step 1: Validate file exists
    const fullPath = path.resolve(assetUrl);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      result.metadata.fileSize = stats.size;
      result.metadata.fileCreated = stats.birthtime;
      result.isValid = true;
    } else {
      // Check if it's a relative URL in uploads
      const altPath = path.join(process.cwd(), '..', 'uploads', path.basename(assetUrl));
      if (fs.existsSync(altPath)) {
        result.originalUrl = altPath;
        result.isValid = true;
      } else {
        throw new Error(`Asset file not found: ${assetUrl}`);
      }
    }

    await job.updateProgress(30);
    await jobModel.updateJobStatus(jobId, { progress: 30 });

    // Step 2: Get MIME type
    const mime = inferMimeType(assetUrl);
    result.metadata.mimeType = mime;

    // Step 3: Generate thumbnail if requested
    if (options?.generateThumbnail && result.isValid) {
      // Note: Actual image processing would use sharp/jimp here
      // For now, mark as pending for future image processing pipeline
      result.thumbnailStatus = 'queued';
    }

    await job.updateProgress(60);
    await jobModel.updateJobStatus(jobId, { progress: 60 });

    // Step 4: Face detection placeholder (future enhancement)
    if (options?.faceDetection && assetType === 'character_photo') {
      result.faceDetection = {
        status: 'pending',
        facesFound: null,
        note: 'Face detection will run via separate AI pipeline',
      };
    }

    await job.updateProgress(80);
    await jobModel.updateJobStatus(jobId, { progress: 80 });

    // Step 5: Asset validation summary
    result.processed = true;
    result.summary = `Asset validated: ${mime}, ${formatBytes(result.metadata.fileSize || 0)}`;

    const duration = Math.round((Date.now() - startTime) / 1000);

    // Complete
    await jobModel.updateJobStatus(jobId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      actual_duration_sec: duration,
      result,
    });

    await job.updateProgress(100);

    // Webhook
    if (webhookUrl) {
      try {
        await axios.post(webhookUrl, {
          jobId,
          status: 'completed',
          result: { processed: true, assetType, metadata: result.metadata },
        });
      } catch (e) {
        console.error('[AssetWorker] Webhook failed:', (e as Error).message);
      }
    }

    return { status: 'success', result };
  } catch (error: any) {
    const duration = Math.round((Date.now() - startTime) / 1000);

    // Dead letter on final attempt
    if (job.attemptsMade >= (job.opts.attempts || 3) - 1) {
      await jobModel.moveToDeadLetter(
        jobId,
        'asset-processing',
        'process-asset',
        userId || null,
        projectId || null,
        error.message,
        error.stack || null,
        job.attemptsMade + 1,
        { assetUrl, assetType }
      );
    }

    await jobModel.updateJobStatus(jobId, {
      status: 'failed',
      error: error.message,
      error_stack: error.stack || null,
      completed_at: new Date().toISOString(),
      actual_duration_sec: duration,
      attempts: job.attemptsMade + 1,
    });

    throw error;
  }
}, {
  connection,
  concurrency: 5,
});

// ─── Worker Events ────────────────────────────────────────────────────────

assetWorker.on('completed', async (job: Job) => {
  console.log(`[AssetWorker] Job ${job.id} completed`);
});

assetWorker.on('failed', async (job: Job | undefined, err: Error) => {
  console.error(`[AssetWorker] Job ${job?.id} failed: ${err.message}`);

  if (job?.data?.webhookUrl) {
    try {
      await axios.post(job.data.webhookUrl, {
        jobId: job.id,
        status: 'failed',
        error: err.message,
      });
    } catch (e) {
      // Ignore
    }
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function inferMimeType(url: string): string {
  const ext = path.extname(url).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
  };
  return map[ext] || 'application/octet-stream';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

export async function closeAssetQueue(): Promise<void> {
  await assetWorker.close();
  await assetQueue.close();
  await connection.quit();
}
