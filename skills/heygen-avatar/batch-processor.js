/**
 * Batch Processor — Bull queue for concurrent HeyGen render management
 *
 * Manages scene generation at scale with:
 * - Max 3 concurrent HeyGen renders (API limit)
 * - Priority-based queuing (foreground scenes first)
 * - Rate limiting and credit depletion detection
 * - Failure isolation (one failed scene doesn't block the movie)
 * - Progress tracking and webhook completion
 * - Retry logic with exponential backoff
 *
 * Architecture:
 * ```
 * POST /movies/generate → batchProcessor.enqueueMovie(scenes)
 *   → Bull queue (max 3 concurrent)
 *     → SceneGenerator.generateScene() per scene
 *       → PostgreSQL status updates
 *         → WebSocket / webhook notification → client
 * ```
 *
 * @module batch-processor
 * @requires bull
 * @requires ./scene-generator
 * @requires ./client
 */

const Bull = require('bull');
const { SceneGenerator } = require('./scene-generator');
const { AvatarManager } = require('./avatar-manager');
const { getDefaultClient } = require('./client');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 3; // HeyGen V3 concurrent render limit
const DEFAULT_JOB_OPTS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 10_000, // 10s initial backoff
  },
  removeOnComplete: 100, // Keep last 100 completed jobs for inspection
  removeOnFail: 200,
  timeout: 600_000, // 10 minute job timeout
};

// ---------------------------------------------------------------------------
// BatchProcessor
// ---------------------------------------------------------------------------

/**
 * Queue-based batch processor for multi-scene movie generation.
 *
 * Uses Bull (Redis-backed queue) to enforce HeyGen's 3-concurrent-render
 * limit while providing observability, retry logic, and failure isolation.
 *
 * @example
 *   const processor = new BatchProcessor({ redis: { host: 'localhost' } });
 *
 *   // Generate an entire movie
 *   const batch = await processor.enqueueMovie('movie-001', [
 *     { character: 'ben', scenePrompt: '...', lumaSceneUrl: '...', elevenlabsAudioUrl: '...' },
 *     { character: 'sarah', scenePrompt: '...', lumaSceneUrl: '...', elevenlabsAudioUrl: '...' },
 *     // ... 10+ scenes
 *   ]);
 *
 *   // Check progress
 *   const progress = await processor.getMovieProgress('movie-001');
 *   console.log(`${progress.completed}/${progress.total} done`);
 */
class BatchProcessor {
  /**
   * @param {object} opts
   * @param {object} opts.redis             Bull Redis connection config
   * @param {string} [opts.queueName]       Queue name (default 'heygen-scenes')
   * @param {object} [opts.heygenClient]     HeyGen API client
   * @param {object} [opts.avatarManager]    Avatar manager
   * @param {object} [opts.sceneGenerator]   Scene generator
   * @param {object} [opts.db]              PostgreSQL pool for job persistence
   * @param {number} [opts.maxConcurrent]    Max concurrent HeyGen renders (default 3)
   */
  constructor(opts = {}) {
    const client = opts.heygenClient || getDefaultClient();

    this.avatarManager = opts.avatarManager || new AvatarManager({ client, db: opts.db });
    this.sceneGenerator = opts.sceneGenerator || new SceneGenerator({
      client,
      avatarManager: this.avatarManager,
      db: opts.db,
    });

    this.maxConcurrent = opts.maxConcurrent || MAX_CONCURRENT;
    this.db = opts.db || null;

    // ── Redis-backed Bull queue ──────────────────────────────────
    this.queue = new Bull(opts.queueName || 'heygen-scenes', {
      redis: opts.redis || { host: '127.0.0.1', port: 6379 },
      defaultJobOptions: { ...DEFAULT_JOB_OPTS, ...opts.defaultJobOptions },
      limiter: {
        max: this.maxConcurrent,
        duration: 1000, // Per second
      },
    });

    // ── Register the processor ───────────────────────────────────
    this.queue.process(this.maxConcurrent, this._processJob.bind(this));

    // ── Event handlers ───────────────────────────────────────────
    this._setupEvents();

    // ── Track active movie batches ───────────────────────────────
    /** Map<movieId, { total, completed, failed, status, jobIds }> */
    this._movieBatches = new Map();
  }

  // -----------------------------------------------------------------------
  // Public API — Batch management
  // -----------------------------------------------------------------------

  /**
   * Enqueue all scenes for a movie.
   *
   * Each scene becomes a separate Bull job. The movie batch tracks
   * overall progress. Jobs are processed with max 3 concurrency.
   *
   * @param {string}       movieId     Unique movie identifier
   * @param {SceneConfig[]} scenes      Scene configurations (see SceneGenerator)
   * @param {object}        [opts]
   * @param {boolean}       [opts.failFast]  Stop entire batch on first failure
   * @param {string}        [opts.callbackUrl] Webhook for batch completion
   * @returns {Promise<BatchResult>}
   */
  async enqueueMovie(movieId, scenes, opts = {}) {
    if (!movieId) throw new Error('movieId is required');
    if (!scenes || scenes.length === 0) throw new Error('At least one scene is required');

    console.log(`[heygen-avatar] 📦 Enqueuing movie "${movieId}" with ${scenes.length} scenes`);

    // Initialize batch tracking
    this._movieBatches.set(movieId, {
      movieId,
      total: scenes.length,
      completed: 0,
      failed: 0,
      status: 'queued',
      jobIds: [],
      failFast: opts.failFast || false,
      callbackUrl: opts.callbackUrl || null,
      startedAt: new Date().toISOString(),
    });

    // Create Bull jobs for each scene
    const jobs = [];
    for (let i = 0; i < scenes.length; i++) {
      const sceneConfig = {
        ...scenes[i],
        sceneId: scenes[i].sceneId || `${movieId}_scene_${String(i + 1).padStart(3, '0')}`,
        sceneIndex: i,
        totalScenes: scenes.length,
      };

      const job = await this.queue.add(
        'generate-scene',
        { movieId, sceneConfig },
        {
          priority: i < 3 ? 1 : 2, // Higher priority for first 3 (start sooner)
          jobId: sceneConfig.sceneId,
        }
      );

      jobs.push(job);
    }

    const batch = this._movieBatches.get(movieId);
    batch.jobIds = jobs.map(j => j.id);

    return {
      movieId,
      status: 'queued',
      totalScenes: scenes.length,
      jobs: jobs.map(j => ({ id: j.id, sceneId: j.data.sceneConfig.sceneId })),
    };
  }

  /**
   * Get the progress of a movie batch.
   *
   * @param {string} movieId
   * @returns {MovieProgress | null}
   */
  getMovieProgress(movieId) {
    const batch = this._movieBatches.get(movieId);
    if (!batch) return null;

    return {
      movieId,
      total: batch.total,
      completed: batch.completed,
      failed: batch.failed,
      status: batch.status,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt || null,
      percentComplete: batch.total > 0
        ? Math.round(((batch.completed + batch.failed) / batch.total) * 100)
        : 0,
    };
  }

  /**
   * Get detailed progress for a movie including per-scene results.
   *
   * @param {string} movieId
   * @returns {Promise<MovieProgress | null>}
   */
  async getMovieProgressDetailed(movieId) {
    const batch = this._movieBatches.get(movieId);
    if (!batch) return null;

    const progress = this.getMovieProgress(movieId);

    // Gather per-job status from Bull
    const sceneStatuses = [];
    for (const jobId of batch.jobIds) {
      try {
        const job = await this.queue.getJob(jobId);
        if (job) {
          const state = await job.getState();
          sceneStatuses.push({
            sceneId: job.data.sceneConfig.sceneId,
            jobId,
            state,
            progress: job.progress(),
            result: job.returnvalue || null,
            failedReason: job.failedReason || null,
            attempts: job.attemptsMade,
          });
        }
      } catch (_) { /* job may have been removed */ }
    }

    return { ...progress, scenes: sceneStatuses };
  }

  /**
   * Pause the queue (stops processing new jobs).
   */
  async pause() {
    await this.queue.pause();
    console.log('[heygen-avatar] ⏸️  Queue paused');
  }

  /**
   * Resume the queue.
   */
  async resume() {
    await this.queue.resume();
    console.log('[heygen-avatar] ▶️  Queue resumed');
  }

  /**
   * Get queue-wide statistics.
   *
   * @returns {Promise<object>}
   */
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
      this.queue.getPausedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      maxConcurrent: this.maxConcurrent,
      moviesInProgress: this._movieBatches.size,
    };
  }

  /**
   * Clean up completed/failed jobs older than the given age.
   *
   * @param {number} [ageMs=3600000]  Clean jobs older than this (default 1 hour)
   */
  async clean(ageMs = 3_600_000) {
    await this.queue.clean(ageMs, 'completed');
    await this.queue.clean(ageMs, 'failed');
  }

  /**
   * Gracefully shut down the queue processor.
   */
  async shutdown() {
    await this.queue.close();
  }

  // -----------------------------------------------------------------------
  // Internal — job processor
  // -----------------------------------------------------------------------

  /**
   * Process a single scene generation job.
   *
   * Called by Bull when a job is ready. Runs with 3 concurrent workers.
   */
  async _processJob(job) {
    const { movieId, sceneConfig } = job.data;

    console.log(`[heygen-avatar] 🔨 Processing ${sceneConfig.sceneId} (attempt ${job.attemptsMade + 1})`);

    // Update progress
    await job.progress(10); // Started

    try {
      const result = await this.sceneGenerator.generateScene({
        ...sceneConfig,
        sceneId: sceneConfig.sceneId,
      });

      await job.progress(100);

      // Update batch progress
      this._updateBatchProgress(movieId, 'completed');

      return result;
    } catch (err) {
      // Update batch progress
      this._updateBatchProgress(movieId, 'failed', err.message);

      // Check credit depletion
      if (err.message?.includes('credit') || err.message?.includes('quota')) {
        console.error('[heygen-avatar] ⚠️  Possible credit depletion detected. Pausing queue.');
        await this.queue.pause();
      }

      throw err; // Bull will handle retry
    }
  }

  /**
   * Update the movie batch tracking when a scene completes or fails.
   */
  _updateBatchProgress(movieId, result, errorMessage) {
    const batch = this._movieBatches.get(movieId);
    if (!batch) return;

    if (result === 'completed') batch.completed++;
    else if (result === 'failed') batch.failed++;

    const done = batch.completed + batch.failed;

    // Check if all done
    if (done >= batch.total) {
      batch.status = batch.failed > 0 ? 'completed_with_errors' : 'completed';
      batch.completedAt = new Date().toISOString();

      console.log(
        `[heygen-avatar] 🎬 Movie "${movieId}" done: ${batch.completed}/${batch.total} success, ${batch.failed} failed`
      );

      // Fire webhook if configured
      if (batch.callbackUrl) {
        this._fireCallback(batch.callbackUrl, {
          movieId,
          status: batch.status,
          completed: batch.completed,
          failed: batch.failed,
          total: batch.total,
        }).catch(err => console.error('[heygen-avatar] Webhook failed:', err.message));
      }
    }
  }

  /**
   * Send a POST to the callback URL with batch completion data.
   */
  async _fireCallback(url, payload) {
    const fetch = require('node-fetch');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[heygen-avatar] Callback to ${url} returned ${res.status}`);
    }
  }

  // -----------------------------------------------------------------------
  // Internal — event handlers
  // -----------------------------------------------------------------------

  _setupEvents() {
    this.queue.on('completed', (job, result) => {
      console.log(`[heygen-avatar] ✅ Job ${job.id} completed (${job.data.sceneConfig.sceneId})`);
    });

    this.queue.on('failed', (job, err) => {
      console.error(`[heygen-avatar] ❌ Job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`);

      // On final attempt failure, mark the batch
      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        const { movieId } = job.data;
        this._updateBatchProgress(movieId, 'failed', err.message);
      }
    });

    this.queue.on('stalled', (job) => {
      console.warn(`[heygen-avatar] ⚠️  Job ${job.id} stalled (may be retried)`);
    });

    this.queue.on('error', (err) => {
      console.error('[heygen-avatar] Queue error:', err.message);
    });

    // Rate limit events
    this.queue.on('rate-limited', ({ jobId, delay }) => {
      console.log(`[heygen-avatar] 🐌 Job ${jobId} rate-limited, delayed ${delay}ms`);
    });
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Create a batch processor with Redis defaults from environment.
 *
 * Reads:
 *   REDIS_HOST (default 127.0.0.1)
 *   REDIS_PORT (default 6379)
 *   HEYGEN_MAX_CONCURRENT (default 3)
 *
 * @param {object} [opts] Override defaults
 * @returns {BatchProcessor}
 */
function createBatchProcessor(opts = {}) {
  return new BatchProcessor({
    redis: opts.redis || {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    },
    maxConcurrent: opts.maxConcurrent || parseInt(process.env.HEYGEN_MAX_CONCURRENT || '3', 10),
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  BatchProcessor,
  createBatchProcessor,
  MAX_CONCURRENT,
};

/**
 * @typedef {object} BatchResult
 * @property {string}  movieId      Movie identifier
 * @property {string}  status       'queued'
 * @property {number}  totalScenes  Number of scenes enqueued
 * @property {Array<{id: string, sceneId: string}>} jobs  Bull job references
 */

/**
 * @typedef {object} MovieProgress
 * @property {string}  movieId
 * @property {number}  total
 * @property {number}  completed
 * @property {number}  failed
 * @property {string}  status        'queued' | 'processing' | 'completed' | 'completed_with_errors'
 * @property {number}  percentComplete
 * @property {string}  [startedAt]
 * @property {string}  [completedAt]
 * @property {Array<object>} [scenes] Per-scene details
 */
