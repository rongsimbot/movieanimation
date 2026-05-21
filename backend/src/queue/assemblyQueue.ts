/**
 * assemblyQueue.ts - Phase 7 Video Assembly Queue
 * Handles queueing and processing of FFmpeg video assembly jobs.
 * Enhanced to support transition-based assembly with progress tracking.
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import { assembleVideo, AssemblyOptions, AssemblyResult } from '../services/videoAssembly';
import pool from '../config/database';
import { progressService } from '../services/progressService';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export interface AssemblyJobData {
  userId: string;
  options: AssemblyOptions;
  webhookUrl?: string;
  timelineId?: number;
}

export const assemblyQueue = new Queue('video-assembly', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const addAssemblyJob = async (
  userId: string,
  options: AssemblyOptions,
  webhookUrl?: string,
  timelineId?: number,
) => {
  const job = await assemblyQueue.add('assemble-video', {
    userId,
    options,
    webhookUrl,
    timelineId,
  });
  return job;
};

async function updateAssemblyLog(jobId: string, updates: Record<string, any>) {
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(value);
      }
    }

    values.push(jobId);
    await pool.query(
      `UPDATE assembly_logs SET ${fields.join(', ')} WHERE job_id = $${i}`,
      values
    );
  } catch (err: any) {
    console.warn('[AssemblyQueue] Failed to update log:', err.message);
  }
}

async function updateTimelineStatus(jobId: string, status: string, outputPath?: string) {
  try {
    const logResult = await pool.query(
      'SELECT timeline_id FROM assembly_logs WHERE job_id = $1',
      [jobId]
    );
    if (logResult.rows.length > 0) {
      const { timeline_id } = logResult.rows[0];
      await pool.query(
        'UPDATE timelines SET status = $1, output_path = COALESCE($2, output_path), assembly_completed_at = CASE WHEN $1 IN (\'completed\',\'failed\') THEN NOW() ELSE assembly_completed_at END, updated_at = NOW() WHERE id = $3',
        [status, outputPath || null, timeline_id]
      );
    }
  } catch (err: any) {
    console.warn('[AssemblyQueue] Failed to update timeline:', err.message);
  }
}

function safeJobId(job: Job): string {
  return job.id || 'unknown';
}

// ─── Worker ─────────────────────────────────────────────────────

export const assemblyWorker = new Worker(
  'video-assembly',
  async (job: Job<AssemblyJobData>) => {
    const { userId, options, timelineId } = job.data;
    const jobId = safeJobId(job);
    console.log(`[AssemblyQueue] Job ${jobId} — User: ${userId} — Clips: ${options.clips.length}`);

    await updateAssemblyLog(jobId, {
      status: 'processing',
      started_at: new Date().toISOString(),
    });

    if (timelineId) {
      await updateTimelineStatus(jobId, 'assembling');
    }

    progressService.updateProgress({ jobId, state: 'generating', progress: 0, message: 'Starting assembly...' });

    const optionsWithProgress: AssemblyOptions = {
      ...options,
      onProgress: (percent: number) => {
        job.updateProgress(percent).catch(() => {});
        progressService.updateProgress({ jobId, state: 'generating', progress: percent, message: `Rendering: ${percent}%` });
      },
    };

    try {
      const result: AssemblyResult = await assembleVideo(optionsWithProgress);

      progressService.updateProgress({ jobId, state: 'completed', progress: 100, message: 'Assembly complete' });

      await updateAssemblyLog(jobId, {
        status: 'completed',
        progress: 100,
        output_path: result.outputPath,
        completed_at: new Date().toISOString(),
      });

      if (timelineId) {
        await updateTimelineStatus(jobId, 'completed', result.outputPath);
      }

      return {
        status: 'success',
        ...result,
      };
    } catch (error: any) {
      progressService.updateProgress({ jobId, state: 'failed', progress: 0, message: error.message });

      await updateAssemblyLog(jobId, {
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      });

      if (timelineId) {
        await updateTimelineStatus(jobId, 'failed');
      }

      throw new Error(`Video assembly failed: ${error.message}`);
    }
  },
  { connection }
);

// ─── Worker Events ──────────────────────────────────────────────

assemblyWorker.on('completed', async (job) => {
  const jobId = safeJobId(job);
  console.log(`[AssemblyQueue] ✅ Job ${jobId} completed`);
  if (job.data.webhookUrl) {
    try {
      await axios.post(job.data.webhookUrl, {
        jobId,
        status: 'completed',
        result: job.returnvalue,
      });
    } catch (e) {
      console.warn('[AssemblyQueue] Webhook delivery failed');
    }
  }
});

assemblyWorker.on('failed', async (job, err) => {
  const jobId = job ? safeJobId(job) : 'unknown';
  console.log(`[AssemblyQueue] ❌ Job ${jobId} failed: ${err.message}`);

  if (job) {
    await updateAssemblyLog(jobId, {
      status: 'failed',
      error_message: err.message,
      completed_at: new Date().toISOString(),
    });

    if (job.data?.timelineId) {
      await updateTimelineStatus(jobId, 'failed');
    }

    if (job.data?.webhookUrl) {
      try {
        await axios.post(job.data.webhookUrl, {
          jobId,
          status: 'failed',
          error: err.message,
        });
      } catch (e) {
        console.warn('[AssemblyQueue] Webhook delivery failed');
      }
    }
  }
});

export async function closeQueues() {
  await assemblyWorker.close();
  await assemblyQueue.close();
}
