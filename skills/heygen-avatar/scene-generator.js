/**
 * Scene Generator — End-to-end pipeline: Luma scene + ElevenLabs audio → HeyGen video
 *
 * Orchestrates the full MovieAnimation scene generation workflow:
 *
 *   1. Load/create avatar for the character (Ben / Sarah)
 *   2. Upload Luma-generated background scene to HeyGen
 *   3. Generate/upload ElevenLabs dialogue audio to HeyGen
 *   4. Submit video generation request to HeyGen V3 Video Agent
 *   5. Poll for completion (or register webhook)
 *   6. Download final MP4 video
 *
 * Designed to be called by Express routes and batch processors.
 *
 * @module scene-generator
 * @requires ../client
 * @requires ./avatar-manager
 * @requires ./utils/asset-uploader
 * @requires ./utils/poller
 * @requires fs-extra
 */

const { getDefaultClient, HeyGenAPIError } = require('./client');
const { AvatarManager } = require('./avatar-manager');
const { AssetUploader } = require('./utils/asset-uploader');
const { VideoPoller } = require('./utils/poller');
const fs = require('fs-extra');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_OUTPUT_DIR = process.env.VIDEO_OUTPUT_PATH || '/data/movieanimation/output';
const DEFAULT_ASSET_DIR = process.env.ASSET_STORAGE_PATH || '/data/movieanimation/assets';
const DEFAULT_DIMENSIONS = { width: 1920, height: 1080 };
const VIDEO_URL_TTL_DAYS = 7;

// ---------------------------------------------------------------------------
// SceneGenerator
// ---------------------------------------------------------------------------

/**
 * Full pipeline generator for a single MovieAnimation scene.
 *
 * Accepts a scene configuration and produces a completed MP4 file
 * with the avatar rendered into a Luma-generated background speaking
 * ElevenLabs-generated dialogue.
 *
 * Two operating modes:
 * - **Sync** (default): Calls generateScene() and waits for completion
 * - **Async**: Calls submitScene() which returns immediately then fires webhooks
 *
 * @example
 *   const gen = new SceneGenerator();
 *   const result = await gen.generateScene({
 *     character: 'ben',
 *     scenePrompt: 'Ben sits at a 1950s diner counter, noir lighting',
 *     dialogue: 'The usual, please.',
 *     lumaSceneUrl: 'https://storage.example.com/scenes/diner_01.mp4',
 *     elevenlabsAudioUrl: 'https://storage.example.com/audio/ben_01.wav',
 *     sceneId: 'scene-001',
 *   });
 *   console.log(result.videoPath); // /data/movieanimation/output/scene-001.mp4
 */
class SceneGenerator {
  /**
   * @param {object}       [opts]
   * @param {HeyGenClient}  [opts.client]        HeyGen API client
   * @param {AvatarManager} [opts.avatarManager]  Avatar manager
   * @param {AssetUploader} [opts.assetUploader]  Asset uploader
   * @param {VideoPoller}   [opts.poller]         Video poller
   * @param {string}        [opts.outputDir]      Download destination
   * @param {object}        [opts.db]             Database pool for persistence (optional)
   */
  constructor(opts = {}) {
    this.client = opts.client || getDefaultClient();
    this.avatarManager = opts.avatarManager || new AvatarManager({ client: this.client, db: opts.db });
    this.assetUploader = opts.assetUploader || new AssetUploader({ client: this.client });
    this.poller = opts.poller || new VideoPoller({ client: this.client });
    this.outputDir = opts.outputDir || DEFAULT_OUTPUT_DIR;
    this.db = opts.db || null;

    // Ensure output directory exists
    try {
      fs.ensureDirSync(this.outputDir);
    } catch (err) {
      console.warn(`[heygen-avatar] Cannot create output dir ${this.outputDir}, using temp: ${err.message}`);
      this.outputDir = require('os').tmpdir();
      fs.ensureDirSync(this.outputDir);
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate a complete scene video (sync — blocks until done).
   *
   * This is the primary entry point. It:
   * 1. Ensures the avatar exists (creates if needed)
   * 2. Uploads Luma background as HeyGen asset
   * 3. Uploads ElevenLabs audio as HeyGen asset
   * 4. Generates video via HeyGen Video Agent
   * 5. Polls until complete
   * 6. Downloads the final MP4
   *
   * @param {SceneConfig} config  Scene generation parameters
   * @returns {Promise<SceneResult>}
   */
  async generateScene(config) {
    this._validateConfig(config);

    const {
      character,
      scenePrompt,
      dialogue,
      lumaSceneUrl,
      elevenlabsAudioUrl,
      sceneId = `scene_${Date.now()}`,
      avatarPhotoPath,
      callbackUrl,
    } = config;

    console.log(`[heygen-avatar] 🎬 Generating scene "${sceneId}" (character: ${character})`);

    try {
      // ── Step 1: Avatar ────────────────────────────────────────────
      const avatar = await this.avatarManager.getOrCreate(
        character,
        avatarPhotoPath
      );
      console.log(`[heygen-avatar]   Avatar ready: ${avatar.lookId}`);

      // ── Step 2: Upload Assets ─────────────────────────────────────
      const [bgAsset, audioAsset] = await Promise.all([
        this.assetUploader.uploadVideo(lumaSceneUrl),
        this.assetUploader.uploadAudio(elevenlabsAudioUrl),
      ]);
      console.log(`[heygen-avatar]   Assets uploaded: bg=${bgAsset.asset_id}, audio=${audioAsset.asset_id}`);

      // Save asset records to DB (if available)
      if (this.db) {
        await this._saveAssetRecord(bgAsset, 'background', sceneId);
        await this._saveAssetRecord(audioAsset, 'audio', sceneId);
      }

      // ── Step 3: Generate Video ────────────────────────────────────
      const session = await this.client.generateVideo({
        prompt: scenePrompt,
        avatarId: avatar.lookId,
        assetIds: [bgAsset.asset_id, audioAsset.asset_id],
        orientation: config.orientation || 'landscape',
        width: config.width || DEFAULT_DIMENSIONS.width,
        height: config.height || DEFAULT_DIMENSIONS.height,
        callbackUrl,
      });

      const sessionId = session.session_id || session.id;
      console.log(`[heygen-avatar]   Video Agent session: ${sessionId}`);

      // Save initial record
      if (this.db) {
        await this._saveVideoRecord({
          sceneId,
          sessionId,
          status: 'processing',
          character,
        });
      }

      // If callback provided, return immediately (async mode)
      if (callbackUrl) {
        return {
          sceneId,
          sessionId,
          status: 'queued',
          character,
          avatarLookId: avatar.lookId,
          backgroundAssetId: bgAsset.asset_id,
          audioAssetId: audioAsset.asset_id,
          callbackUrl,
        };
      }

      // ── Step 4: Poll for completion ───────────────────────────────
      console.log(`[heygen-avatar]   Polling for completion...`);
      const result = await this.poller.waitForVideo({ sessionId });

      console.log(`[heygen-avatar]   ✅ Video complete: ${result.videoId} (${result.duration}s)`);

      // ── Step 5: Download ──────────────────────────────────────────
      const localPath = await this._download(result.videoUrl, sceneId);

      // Update DB record
      if (this.db) {
        await this._updateVideoRecord(sceneId, {
          heygenVideoId: result.videoId,
          status: 'completed',
          videoUrl: result.videoUrl,
          thumbnailUrl: result.thumbnailUrl,
          duration: result.duration,
          completedAt: new Date(),
        });
      }

      return {
        sceneId,
        videoId: result.videoId,
        sessionId,
        status: 'completed',
        character,
        avatarLookId: avatar.lookId,
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl,
        duration: result.duration,
        localPath,
      };
    } catch (err) {
      console.error(`[heygen-avatar] ❌ Scene "${sceneId}" failed:`, err.message);

      // Record failure
      if (this.db) {
        await this._updateVideoRecord(sceneId, {
          status: 'failed',
          failureMessage: err.message,
        });
      }

      throw new HeyGenAPIError(
        `Scene generation failed for "${sceneId}": ${err.message}`,
        err.status || 0,
        { sceneId, character, originalError: err.message }
      );
    }
  }

  /**
   * Submit a scene for async generation (returns immediately).
   * Requires a callbackUrl for completion notification.
   *
   * @param {SceneConfig} config
   * @returns {Promise<{sceneId: string, sessionId: string, status: 'queued'}>}
   */
  async submitScene(config) {
    if (!config.callbackUrl) {
      throw new HeyGenAPIError(
        'callbackUrl is required for async scene submission',
        400
      );
    }
    return this.generateScene(config);
  }

  /**
   * Generate multiple scenes sequentially (one after another).
   *
   * @param {SceneConfig[]} scenes    Array of scene configurations
   * @param {function}      [onProgress] Called after each scene: (completed, total, result)
   * @returns {Promise<SceneResult[]>}
   */
  async generateScenesSequential(scenes, onProgress) {
    const results = [];

    for (let i = 0; i < scenes.length; i++) {
      try {
        const result = await this.generateScene(scenes[i]);
        results.push(result);
      } catch (err) {
        results.push({
          sceneId: scenes[i].sceneId,
          status: 'failed',
          error: err.message,
          character: scenes[i].character,
        });
      }
      if (onProgress) onProgress(i + 1, scenes.length, results[results.length - 1]);
    }

    return results;
  }

  /**
   * Check the status of a previously submitted scene.
   *
   * @param {string} sessionId  Video Agent session ID
   * @returns {Promise<object>}
   */
  async checkStatus(sessionId) {
    const session = await this.client.getVideoAgentSession(sessionId);
    const videoId = session?.video_id;

    if (!videoId) {
      return { sessionId, status: 'initializing' };
    }

    try {
      const video = await this.client.getVideoStatus(videoId);
      return {
        sessionId,
        videoId,
        status: video.status,
        videoUrl: video.video_url,
        thumbnailUrl: video.thumbnail_url,
        duration: video.duration,
      };
    } catch (err) {
      return { sessionId, videoId, status: 'unknown', error: err.message };
    }
  }

  /**
   * Download a completed video if not already downloaded.
   *
   * @param {string} sceneId       Scene identifier for filename
   * @param {string} [videoUrl]    Direct video URL (fetches from DB if not provided)
   * @returns {Promise<string>}    Local file path
   */
  async downloadScene(sceneId, videoUrl) {
    let url = videoUrl;

    if (!url && this.db) {
      const result = await this.db.query(
        'SELECT video_url FROM heygen_videos WHERE scene_id = $1 AND status = $2',
        [sceneId, 'completed']
      );
      url = result.rows?.[0]?.video_url;
    }

    if (!url) {
      throw new HeyGenAPIError(`No video URL found for scene "${sceneId}"`, 404);
    }

    return this._download(url, sceneId);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Validate required scene configuration fields.
   */
  _validateConfig(config) {
    const required = ['character', 'scenePrompt', 'lumaSceneUrl', 'elevenlabsAudioUrl'];
    const missing = required.filter(f => !config[f]);
    if (missing.length > 0) {
      throw new HeyGenAPIError(
        `Missing required scene config fields: ${missing.join(', ')}`,
        400
      );
    }
  }

  /**
   * Download a video from HeyGen CDN to local storage.
   *
   * @param {string} url      Video URL from HeyGen
   * @param {string} sceneId  Scene identifier for filename
   * @returns {Promise<string>} Local file path
   */
  async _download(url, sceneId) {
    const dest = path.join(this.outputDir, `${sceneId}.mp4`);

    console.log(`[heygen-avatar]   Downloading ${url} → ${dest}`);

    const { default: fetch } = await import('node-fetch');
    const res = await fetch(url);
    if (!res.ok) {
      throw new HeyGenAPIError(
        `Failed to download video: ${res.status} ${res.statusText}`,
        res.status
      );
    }

    await new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(dest);
      res.body.pipe(stream);
      res.body.on('error', reject);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    const stat = fs.statSync(dest);
    console.log(`[heygen-avatar]   Downloaded ${(stat.size / 1024 / 1024).toFixed(1)}MB to ${dest}`);

    return dest;
  }

  /**
   * Save an asset record to the database.
   */
  async _saveAssetRecord(asset, type, sceneId) {
    try {
      await this.db.query(
        `INSERT INTO heygen_assets (asset_id, asset_type, scene_id, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (asset_id) DO NOTHING`,
        [asset.asset_id, type, sceneId, asset.mime_type || null, asset.size_bytes || null]
      );
    } catch (err) {
      console.warn('[heygen-avatar] Failed to save asset record:', err.message);
    }
  }

  /**
   * Save a video generation record to the database.
   */
  async _saveVideoRecord({ sceneId, sessionId, status, character }) {
    try {
      await this.db.query(
        `INSERT INTO heygen_videos (scene_id, session_id, status)
         VALUES ($1, $2, $3)`,
        [sceneId, sessionId, status]
      );
    } catch (err) {
      console.warn('[heygen-avatar] Failed to save video record:', err.message);
    }
  }

  /**
   * Update a video record in the database.
   */
  async _updateVideoRecord(sceneId, fields) {
    try {
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      const fieldMap = {
        heygenVideoId: 'heygen_video_id',
        status: 'status',
        videoUrl: 'video_url',
        thumbnailUrl: 'thumbnail_url',
        duration: 'duration_seconds',
        failureMessage: 'failure_message',
        completedAt: 'completed_at',
      };

      for (const [key, col] of Object.entries(fieldMap)) {
        if (fields[key] !== undefined) {
          setClauses.push(`${col} = $${paramIndex++}`);
          values.push(fields[key]);
        }
      }

      if (setClauses.length > 0) {
        values.push(sceneId);
        await this.db.query(
          `UPDATE heygen_videos SET ${setClauses.join(', ')}
           WHERE scene_id = $${paramIndex}`,
          values
        );
      }
    } catch (err) {
      console.warn('[heygen-avatar] Failed to update video record:', err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

/**
 * Quick scene generation using default client/avatar-manager.
 */
async function generateScene(config) {
  const gen = new SceneGenerator();
  return gen.generateScene(config);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  SceneGenerator,
  generateScene,
};

/**
 * @typedef {object} SceneConfig
 * @property {string} character           'ben' | 'sarah' | custom avatar key
 * @property {string} scenePrompt         HeyGen prompt describing the scene
 * @property {string} [dialogue]          Dialogue text (for logging/metadata)
 * @property {string} lumaSceneUrl        URL or path to Luma-generated background video
 * @property {string} elevenlabsAudioUrl  URL or path to ElevenLabs dialogue audio
 * @property {string} [sceneId]           Unique scene identifier (auto-generated if omitted)
 * @property {string} [avatarPhotoPath]   Photo path (required for first avatar creation)
 * @property {string} [callbackUrl]       Webhook URL for async completion
 * @property {string} [orientation]       'landscape' (default) | 'portrait'
 * @property {number} [width]             Video width (default 1920)
 * @property {number} [height]            Video height (default 1080)
 */

/**
 * @typedef {object} SceneResult
 * @property {string} sceneId         Scene identifier
 * @property {string} [videoId]       HeyGen video ID
 * @property {string} [sessionId]     Video Agent session ID
 * @property {string} status          'completed' | 'queued' | 'failed'
 * @property {string} character       Character key
 * @property {string} [avatarLookId]  Avatar look ID used
 * @property {string} [videoUrl]      CDN URL for the rendered video
 * @property {string} [thumbnailUrl]  Thumbnail image URL
 * @property {number} [duration]      Video duration in seconds
 * @property {string} [localPath]     Downloaded local file path
 * @property {string} [error]         Error message if failed
 */
