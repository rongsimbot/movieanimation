/**
 * progressService.ts - Real-Time Progress Tracking Service
 *
 * Provides server-sent events (SSE) for tracking video generation progress.
 * Supports:
 * - Per-job progress tracking
 * - Per-project batch tracking
 * - Webhook callbacks
 */

import { EventEmitter } from 'events';
import { Request, Response } from 'express';

// ---- Types ----

export interface ProgressUpdate {
  jobId: string;
  projectId?: string;
  userId?: string;
  sceneId?: string;
  state: 'queued' | 'starting' | 'generating' | 'polling' | 'completed' | 'failed';
  progress: number; // 0-100
  message: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface BatchProgress {
  projectId: string;
  totalScenes: number;
  completedScenes: number;
  failedScenes: number;
  scenes: Record<string, ProgressUpdate>;
  overallProgress: number; // 0-100
  estimatedTotalCost: number;
  currentCost: number;
}

// ---- Event Emitter ----

class ProgressService extends EventEmitter {
  private batches: Map<string, BatchProgress> = new Map();
  private jobs: Map<string, ProgressUpdate> = new Map();
  private sseClients: Map<string, Response[]> = new Map(); // projectId -> SSE clients

  /**
   * Emit a progress update for a job
   */
  updateProgress(update: Omit<ProgressUpdate, 'timestamp'>): void {
    const fullUpdate: ProgressUpdate = {
      ...update,
      timestamp: new Date().toISOString(),
    };

    this.jobs.set(update.jobId, fullUpdate);

    // Update batch progress if part of a project
    if (update.projectId) {
      this.updateBatchProgress(update.projectId, fullUpdate);
    }

    // Emit event
    this.emit(`job:${update.jobId}`, fullUpdate);
    if (update.userId) this.emit(`user:${update.userId}`, fullUpdate);

    // Send to SSE clients
    this.sendToSseClients(update.projectId || update.userId || 'global', fullUpdate);

    console.log(`[Progress] ${update.jobId}: ${update.state} ${update.progress}% - ${update.message}`);
  }

  /**
   * Initialize batch tracking for a project
   */
  initBatch(projectId: string, totalScenes: number, estimatedTotalCost: number = 0): void {
    this.batches.set(projectId, {
      projectId,
      totalScenes,
      completedScenes: 0,
      failedScenes: 0,
      scenes: {},
      overallProgress: 0,
      estimatedTotalCost,
      currentCost: 0,
    });

    this.updateProgress({
      jobId: `batch:${projectId}`,
      projectId,
      state: 'starting',
      progress: 0,
      message: `Starting batch generation: ${totalScenes} scenes`,
    });
  }

  /**
   * Update batch progress
   */
  private updateBatchProgress(projectId: string, update: ProgressUpdate): void {
    const batch = this.batches.get(projectId);
    if (!batch) return;

    batch.scenes[update.jobId] = update;

    if (update.state === 'completed') {
      batch.completedScenes++;
      if (update.metadata?.cost) batch.currentCost += update.metadata.cost;
    } else if (update.state === 'failed') {
      batch.failedScenes++;
    }

    const totalDone = batch.completedScenes + batch.failedScenes;
    batch.overallProgress = Math.round((totalDone / batch.totalScenes) * 100);

    this.emit(`batch:${projectId}`, batch);
  }

  /**
   * Get current progress for a job
   */
  getJobProgress(jobId: string): ProgressUpdate | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get batch progress for a project
   */
  getBatchProgress(projectId: string): BatchProgress | undefined {
    return this.batches.get(projectId);
  }

  // ---- SSE Support ----

  /**
   * Subscribe a client to SSE updates for a project
   */
  subscribeSse(channel: string, res: Response): void {
    if (!this.sseClients.has(channel)) {
      this.sseClients.set(channel, []);
    }

    const clients = this.sseClients.get(channel)!;
    clients.push(res);

    // Send current batch state if available
    const batch = this.batches.get(channel);
    if (batch) {
      this.sendSse(res, 'batch-state', batch);
    }

    // Remove client on close
    res.on('close', () => {
      const idx = clients.indexOf(res);
      if (idx > -1) clients.splice(idx, 1);
    });
  }

  /**
   * Send SSE data to all subscribed clients on a channel
   */
  private sendToSseClients(channel: string, data: any): void {
    const clients = this.sseClients.get(channel);
    if (!clients || clients.length === 0) return;

    const eventName = data.sceneId ? 'scene-progress' : 'job-progress';

    for (const res of clients) {
      this.sendSse(res, eventName, data);
    }

    // Also send to global clients
    const globalClients = this.sseClients.get('global');
    if (globalClients && channel !== 'global') {
      for (const res of globalClients) {
        this.sendSse(res, eventName, data);
      }
    }
  }

  /**
   * Send a single SSE message
   */
  private sendSse(res: Response, event: string, data: any): void {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Client disconnected - will be cleaned up on close
    }
  }

  /**
   * Handle SSE connection request
   */
  handleSseConnection(req: Request, res: Response): void {
    const channel = (req.query.channel as string) || 'global';

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial connection event
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ channel, timestamp: new Date().toISOString() })}\n\n`);

    // Subscribe
    this.subscribeSse(channel, res);

    // Heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    res.on('close', () => {
      clearInterval(heartbeat);
    });
  }
}

// ---- Singleton ----

export const progressService = new ProgressService();

// ---- Convenience Functions ----

/**
 * Update progress for a video generation job
 */
export function updateVideoProgress(
  jobId: string,
  state: ProgressUpdate['state'],
  progress: number,
  message: string,
  metadata?: Record<string, any>
): void {
  progressService.updateProgress({
    jobId,
    state,
    progress,
    message,
    metadata,
  });
}

/**
 * Track a batch video generation project
 */
export function trackBatchGeneration(
  projectId: string,
  totalScenes: number,
  estimatedCost: number
): void {
  progressService.initBatch(projectId, totalScenes, estimatedCost);
}
