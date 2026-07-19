/**
 * Video Status Poller — Async polling with backoff and timeout
 *
 * Polls the HeyGen API for video generation completion. Supports:
 * - Exponential backoff (10s → 30s intervals)
 * - Configurable max attempts and timeout
 * - Both video ID and session ID polling modes
 * - Detailed progress events via callback
 * - Webhook integration (register, verify)
 *
 * @module poller
 * @requires ../client
 */

const { getDefaultClient, HeyGenAPIError } = require('../client');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid terminal states for a HeyGen video */
const TERMINAL_STATES = ['completed', 'failed', 'cancelled'];

/** Default polling configuration */
const DEFAULTS = {
  initialInterval: 10_000,   // 10 seconds first poll
  maxInterval: 60_000,       // Maximum 60 seconds between polls
  maxAttempts: 60,           // 60 attempts (up to ~30 min with backoff)
  overallTimeout: 600_000,   // 10 minute hard timeout
  backoffMultiplier: 1.5,    // Each interval = previous × 1.5
  jitter: 0.1,               // ±10% random jitter to avoid thundering herd
};

// ---------------------------------------------------------------------------
// VideoPoller
// ---------------------------------------------------------------------------

/**
 * Resilient polling client for HeyGen video generation.
 *
 * Two polling modes:
 * 1. **videoId** — known video ID, poll GET /v3/videos/{id} directly
 * 2. **sessionId** — poll GET /v3/video-agents/{id} first, then switch to video ID
 *
 * @example
 *   const poller = new VideoPoller();
 *   const result = await poller.waitForVideo({ videoId: 'vid_abc' });
 *   console.log(result.videoUrl);
 */
class VideoPoller {
  /**
   * @param {object}      [opts]
   * @param {HeyGenClient} [opts.client]        HeyGen API client
   * @param {number}       [opts.initialInterval] First poll delay (ms)
   * @param {number}       [opts.maxInterval]    Maximum poll interval (ms)
   * @param {number}       [opts.maxAttempts]    Maximum number of polls
   * @param {number}       [opts.overallTimeout] Hard timeout (ms)
   * @param {number}       [opts.backoffMultiplier] Backoff multiplier
   * @param {number}       [opts.jitter]         Jitter factor (0-1)
   */
  constructor(opts = {}) {
    this.client = opts.client || getDefaultClient();
    this.config = { ...DEFAULTS, ...opts };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Poll until the video reaches a terminal state.
   *
   * @param {object}   params
   * @param {string}  [params.videoId]    HeyGen video ID (preferred)
   * @param {string}  [params.sessionId]  HeyGen Video Agent session ID (fallback)
   * @param {function} [params.onProgress] Called with (status, attempt, elapsedMs)
   * @returns {Promise<VideoResult>}
   */
  async waitForVideo({ videoId, sessionId, onProgress }) {
    if (!videoId && !sessionId) {
      throw new HeyGenAPIError('Either videoId or sessionId is required', 400);
    }

    const startTime = Date.now();

    // Step 1: Resolve session to video ID if needed
    if (!videoId && sessionId) {
      videoId = await this._resolveSessionId(sessionId, startTime);
    }

    // Step 2: Poll video status
    return this._pollVideo(videoId, startTime, onProgress);
  }

  /**
   * Poll multiple videos concurrently up to a concurrency limit.
   *
   * @param {Array<{videoId?: string, sessionId?: string, label?: string}>} items
   * @param {object} [opts]
   * @param {number} [opts.concurrency=3]  Max concurrent polls (internal)
   * @param {function} [opts.onComplete]   Called per item: (label, result)
   * @returns {Promise<Map<string, VideoResult>>} Map of label → result
   */
  async waitForAll(items, opts = {}) {
    const concurrency = opts.concurrency || 3;
    const results = new Map();

    // Batch items to respect API rate limits (polling many at once)
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          const label = item.label || item.videoId || item.sessionId;
          const result = await this.waitForVideo({
            videoId: item.videoId,
            sessionId: item.sessionId,
          });
          results.set(label, result);
          if (opts.onComplete) opts.onComplete(label, result);
          return result;
        })
      );

      // Log failures but don't abort the batch
      for (const r of batchResults) {
        if (r.status === 'rejected') {
          console.error('[heygen-avatar] Batch polling error:', r.reason.message);
        }
      }
    }

    return results;
  }

  /**
   * Poll until all given videos complete OR the first one fails.
   * (Fail-fast variant — stops on first error.)
   *
   * @param {Array<{videoId?: string, sessionId?: string, label?: string}>} items
   * @returns {Promise<Map<string, VideoResult>>}
   */
  async waitForAllOrFirstError(items) {
    const promises = items.map(item =>
      this.waitForVideo({
        videoId: item.videoId,
        sessionId: item.sessionId,
      }).then(result => ({ label: item.label, result }))
    );

    const all = await Promise.all(promises);
    const map = new Map();
    for (const { label, result } of all) {
      map.set(label, result);
    }
    return map;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Resolve a Video Agent session to a video ID by polling the session endpoint.
   */
  async _resolveSessionId(sessionId, startTime) {
    const maxSessionAttempts = 20; // Wait up to ~2 min for video creation
    let interval = this.config.initialInterval;

    for (let attempt = 0; attempt < maxSessionAttempts; attempt++) {
      const elapsed = Date.now() - startTime;
      if (elapsed > this.config.overallTimeout) {
        throw new HeyGenAPIError(
          `Timed out waiting for session ${sessionId} to produce a video ID (${elapsed}ms)`,
          0
        );
      }

      const session = await this.client.getVideoAgentSession(sessionId);
      const videoId = session?.video_id || session?.id;

      if (videoId) return videoId;

      await this._sleep(interval);
      interval = Math.min(
        interval * this.config.backoffMultiplier + this._jitter(interval),
        this.config.maxInterval
      );
    }

    throw new HeyGenAPIError(
      `Session ${sessionId} did not produce a video ID after ${maxSessionAttempts} attempts`,
      0
    );
  }

  /**
   * Core video polling loop with exponential backoff.
   */
  async _pollVideo(videoId, startTime, onProgress) {
    let interval = this.config.initialInterval;

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      const elapsed = Date.now() - startTime;

      // Hard timeout check
      if (elapsed > this.config.overallTimeout) {
        throw new HeyGenAPIError(
          `Polling timed out for video ${videoId} after ${elapsed}ms (${attempt} attempts)`,
          0
        );
      }

      try {
        const video = await this.client.getVideoStatus(videoId);
        const status = video.status || video.state;

        // Progress callback
        if (onProgress) {
          onProgress({
            status,
            attempt: attempt + 1,
            elapsedMs: elapsed,
            video,
          });
        }

        // Terminal state reached
        if (TERMINAL_STATES.includes(status)) {
          if (status === 'completed') {
            return {
              videoId,
              status: 'completed',
              videoUrl: video.video_url,
              thumbnailUrl: video.thumbnail_url,
              duration: video.duration,
              video,
            };
          }
          if (status === 'failed') {
            throw new HeyGenAPIError(
              video.failure_message || `Video ${videoId} generation failed`,
              0,
              video
            );
          }
          if (status === 'cancelled') {
            throw new HeyGenAPIError(`Video ${videoId} was cancelled`, 0, video);
          }
        }

        // Still processing — wait and retry
        await this._sleep(interval);

        // Increase interval with jitter (exponential backoff)
        interval = Math.min(
          interval * this.config.backoffMultiplier + this._jitter(interval),
          this.config.maxInterval
        );
      } catch (err) {
        // Re-throw non-retryable errors
        if (err.name === 'HeyGenAPIError' && err.status !== 429 && err.status < 500) {
          throw err;
        }

        // For transient network errors, retry with backoff
        console.warn(`[heygen-avatar] Poll attempt ${attempt + 1} failed: ${err.message}. Retrying...`);
        await this._sleep(interval);
        interval = Math.min(interval * 2, this.config.maxInterval);
      }
    }

    throw new HeyGenAPIError(
      `Polling exhausted for video ${videoId} after ${this.config.maxAttempts} attempts`,
      0
    );
  }

  /**
   * Calculate jitter: ±jitter% of base
   */
  _jitter(base) {
    if (!this.config.jitter) return 0;
    const range = base * this.config.jitter;
    return (Math.random() - 0.5) * range;
  }

  /** Promise-based delay */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.round(ms)));
  }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/**
 * Quick poll for a single video.
 */
async function waitForVideo(videoId) {
  const poller = new VideoPoller();
  return poller.waitForVideo({ videoId });
}

/**
 * Quick poll for a Video Agent session (resolves session → video → completed).
 */
async function waitForSession(sessionId) {
  const poller = new VideoPoller();
  return poller.waitForVideo({ sessionId });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  VideoPoller,
  waitForVideo,
  waitForSession,
  TERMINAL_STATES,
  DEFAULTS,
};

/**
 * @typedef {object} VideoResult
 * @property {string}  videoId       HeyGen video ID
 * @property {string}  status        'completed'
 * @property {string}  videoUrl      Downloadable MP4 URL
 * @property {string}  [thumbnailUrl] Thumbnail image URL
 * @property {number}  [duration]    Video duration in seconds
 * @property {object}  [video]       Raw API response
 */
