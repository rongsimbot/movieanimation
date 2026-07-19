/**
 * queueHealthMonitor.ts - Queue Health Monitoring Service
 * MovieAnimation Backend - Phase 4 Redis Job Queue
 *
 * Periodically polls all BullMQ queues and saves health snapshots
 * to the database for dashboard visualization and alerting.
 */

import * as jobModel from '../models/jobModel';
import { videoQueue, sceneQueue } from '../queue/videoQueue';
import { scriptQueue } from '../queue/scriptQueue';
import { assetQueue } from '../queue/assetQueue';
import { assemblyQueue } from '../queue/assemblyQueue';
import { exportQueue } from '../queue/exportQueue';

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

const QUEUES: Record<string, any> = {
  'video-generation': videoQueue,
  'scene-generation': sceneQueue,
  'script-parsing': scriptQueue,
  'asset-processing': assetQueue,
  'video-assembly': assemblyQueue,
  'movieanimation-exports': exportQueue,
};

let intervalId: NodeJS.Timeout | null = null;

/**
 * Take a snapshot of all queue health metrics.
 */
async function takeSnapshot(): Promise<void> {
  for (const [name, queue] of Object.entries(QUEUES)) {
    try {
      const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
        queue.getWaitingCount().catch(() => 0),
        queue.getActiveCount().catch(() => 0),
        queue.getCompletedCount().catch(() => 0),
        queue.getFailedCount().catch(() => 0),
        queue.getDelayedCount().catch(() => 0),
        queue.isPaused().catch(() => false),
      ]);

      // Calculate average completion time from DB
      let avgCompletionMs: number | undefined;
      try {
        const jobs = await jobModel.listJobs({
          queueName: name,
          status: 'completed',
          limit: 20,
          orderBy: 'completed_at DESC',
        });
        if (jobs.jobs.length > 0) {
          const durations = jobs.jobs
            .filter(j => j.actual_duration_sec)
            .map(j => j.actual_duration_sec! * 1000);
          if (durations.length > 0) {
            avgCompletionMs = durations.reduce((a, b) => a + b, 0) / durations.length;
          }
        }
      } catch (e) {
        // Ignore DB errors during snapshot
      }

      await jobModel.saveQueueHealth(name, {
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused: isPaused,
        worker_count: active,
        avg_completion_ms: avgCompletionMs,
      });
    } catch (e: any) {
      console.error(`[QueueHealth] Failed to snapshot ${name}: ${e.message}`);
    }
  }
}

/**
 * Start the periodic health monitor.
 */
export function startHealthMonitor(): void {
  if (intervalId) return;

  console.log('[QueueHealth] Starting health monitor (interval: 5 min)');

  // Take initial snapshot
  takeSnapshot().catch(e => {
    console.error('[QueueHealth] Initial snapshot failed:', e.message);
  });

  // Schedule periodic snapshots
  intervalId = setInterval(() => {
    takeSnapshot().catch(e => {
      console.error('[QueueHealth] Periodic snapshot failed:', e.message);
    });
  }, SNAPSHOT_INTERVAL_MS);
}

/**
 * Stop the health monitor.
 */
export function stopHealthMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[QueueHealth] Health monitor stopped');
  }
}

/**
 * Take a one-off snapshot (for testing or manual triggers).
 */
export async function takeOneSnapshot(): Promise<void> {
  await takeSnapshot();
}
