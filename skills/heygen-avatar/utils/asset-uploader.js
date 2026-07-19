/**
 * Asset Uploader — Handles HeyGen asset uploads with validation, retry, and caching
 *
 * Uploads Luma scenes (background video), ElevenLabs audio (dialogue), and
 * reference images to the HeyGen Assets API. Supports both local file paths
 * and remote URLs, with automatic mime-type detection and size validation.
 *
 * @module asset-uploader
 * @requires ./client
 * @requires fs-extra
 */

const { getDefaultClient, HeyGenAPIError } = require('../client');
const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum file sizes (bytes) supported by HeyGen Assets API */
const SIZE_LIMITS = {
  video: 32 * 1024 * 1024,   // 32 MB
  image: 10 * 1024 * 1024,   // 10 MB
  audio: 20 * 1024 * 1024,   // 20 MB
};

/** Supported mime types per asset category */
const MIME_TYPES = {
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  image: ['image/png', 'image/jpeg', 'image/webp'],
  audio: ['audio/mp3', 'audio/wav', 'audio/mpeg', 'audio/wave', 'audio/x-wav'],
};

/** Map extensions → mime type when the file system can't determine it */
const EXT_TO_MIME = {
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
};

// ---------------------------------------------------------------------------
// AssetUploader
// ---------------------------------------------------------------------------

/**
 * Validation-aware uploader for HeyGen assets.
 *
 * Features:
 * - File-size validation against HeyGen limits
 * - Mime-type detection and validation
 * - Automatic retry with exponential backoff
 * - URL → local download → upload support
 * - Batch upload with progress tracking
 *
 * @example
 *   const uploader = new AssetUploader();
 *   const { asset_id } = await uploader.uploadVideo('/scenes/diner_noir.mp4');
 */
class AssetUploader {
  /**
   * @param {object}      [opts]
   * @param {HeyGenClient} [opts.client]    HeyGen API client (uses default when omitted)
   * @param {number}       [opts.maxRetries] Retry attempts for transient failures (default 3)
   * @param {string}       [opts.tmpDir]    Temp directory for URL downloads (default os.tmpdir)
   */
  constructor(opts = {}) {
    this.client = opts.client || getDefaultClient();
    this.maxRetries = opts.maxRetries ?? 3;
    this.tmpDir = opts.tmpDir || require('os').tmpdir();
  }

  // -----------------------------------------------------------------------
  // Public API — single asset
  // -----------------------------------------------------------------------

  /**
   * Upload a video asset (Luma scene background).
   *
   * @param {string} source  Local file path or public URL
   * @returns {Promise<{asset_id: string, url: string, mime_type: string, size_bytes: number}>}
   */
  async uploadVideo(source) {
    return this._upload(source, 'video');
  }

  /**
   * Upload an image asset (reference photo for avatar creation).
   *
   * @param {string} source  Local file path or public URL
   * @returns {Promise<{asset_id: string, url: string, mime_type: string, size_bytes: number}>}
   */
  async uploadImage(source) {
    return this._upload(source, 'image');
  }

  /**
   * Upload an audio asset (ElevenLabs dialogue).
   *
   * @param {string} source  Local file path or public URL
   * @returns {Promise<{asset_id: string, url: string, mime_type: string, size_bytes: number}>}
   */
  async uploadAudio(source) {
    return this._upload(source, 'audio');
  }

  /**
   * Auto-detect asset type from filename extension and upload.
   *
   * @param {string} source  Local file path or public URL
   * @returns {Promise<{asset_id: string, url: string, mime_type: string, size_bytes: number, asset_type: string}>}
   */
  async uploadAuto(source) {
    const ext = path.extname(source).toLowerCase();
    const mime = EXT_TO_MIME[ext] || 'application/octet-stream';
    let category = 'video';
    if (mime.startsWith('image/')) category = 'image';
    else if (mime.startsWith('audio/')) category = 'audio';

    const result = await this._upload(source, category);
    result.asset_type = category;
    return result;
  }

  // -----------------------------------------------------------------------
  // Public API — batch
  // -----------------------------------------------------------------------

  /**
   * Upload multiple assets in parallel with progress callback.
   *
   * @param {Array<{source: string, type: string}>} assets  Array of { source, type }
   * @param {function} [onProgress]  Called with (completed, total, result) after each upload
   * @returns {Promise<Array<object>>} Results in same order as input
   */
  async uploadBatch(assets, onProgress) {
    const results = [];
    let completed = 0;

    const promises = assets.map(async ({ source, type }, index) => {
      try {
        const result = await this._upload(source, type || 'auto');
        results[index] = { success: true, ...result };
      } catch (err) {
        results[index] = { success: false, error: err.message, source, type };
      }
      completed++;
      if (onProgress) onProgress(completed, assets.length, results[index]);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Uploads Luma scene video and ElevenLabs audio in one call for a scene.
   *
   * @param {object}  sceneAssets
   * @param {string}  sceneAssets.backgroundVideo  Path/URL to Luma scene video
   * @param {string}  sceneAssets.audio            Path/URL to ElevenLabs dialogue audio
   * @returns {Promise<{background: object, audio: object}>}
   */
  async uploadSceneAssets({ backgroundVideo, audio }) {
    const [bg, aud] = await Promise.all([
      this.uploadVideo(backgroundVideo),
      this.uploadAudio(audio),
    ]);
    return { background: bg, audio: aud };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Core upload logic with validation, retries, and URL support.
   *
   * @param {string} source   Local path or HTTP(S) URL
   * @param {string} category 'video' | 'image' | 'audio' | 'auto'
   */
  async _upload(source, category) {
    // Determine if source is a URL
    const isUrl = /^https?:\/\//i.test(source);
    let filePath = source;
    let cleanUp = false;

    if (isUrl) {
      filePath = await this._downloadToTemp(source);
      cleanUp = true;
    }

    try {
      // Validate
      await this._validate(filePath, category);

      // Upload with retry
      let lastError;
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const result = await this.client.uploadAsset(filePath);

          // Enrich with file metadata
          const stat = fs.statSync(filePath);
          result.size_bytes = result.size_bytes || stat.size;

          return result;
        } catch (err) {
          lastError = err;
          if (err.status === 429 || err.status >= 500) {
            const backoff = Math.pow(2, attempt) * 1000;
            if (attempt < this.maxRetries) {
              await this._sleep(backoff);
              continue;
            }
          }
          throw err;
        }
      }
      throw lastError;
    } finally {
      if (cleanUp) {
        try { fs.unlinkSync(filePath); } catch (_) { /* best-effort */ }
      }
    }
  }

  /**
   * Validate file existence, size, and mime type.
   */
  async _validate(filePath, category) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Asset file not found: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = EXT_TO_MIME[ext] || 'application/octet-stream';
    const maxSize = SIZE_LIMITS[category] || SIZE_LIMITS.video;

    // Size check
    if (stat.size > maxSize) {
      throw new Error(
        `Asset too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB exceeds ${(maxSize / 1024 / 1024).toFixed(0)}MB limit for ${category}`
      );
    }

    // Mime check (warn only for now — HeyGen validates on their side)
    if (category !== 'auto') {
      const allowed = MIME_TYPES[category] || [];
      if (allowed.length && !allowed.includes(mime)) {
        console.warn(
          `[heygen-avatar] Unexpected mime type "${mime}" for category "${category}". Allowed: ${allowed.join(', ')}. Uploading anyway — HeyGen will validate.`
        );
      }
    }
  }

  /**
   * Download a remote file to a temporary location.
   */
  async _downloadToTemp(url) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download asset from ${url}: ${res.status} ${res.statusText}`);
    }

    const ext = path.extname(new URL(url).pathname) || '.tmp';
    const dest = path.join(this.tmpDir, `heygen_upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);

    await new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(dest);
      res.body.pipe(stream);
      res.body.on('error', reject);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    return dest;
  }

  /** Promise-based delay */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Convenience functions (singleton-backed)
// ---------------------------------------------------------------------------

/**
 * Quick video upload using the default client.
 */
async function uploadVideo(source) {
  const uploader = new AssetUploader();
  return uploader.uploadVideo(source);
}

/**
 * Quick audio upload using the default client.
 */
async function uploadAudio(source) {
  const uploader = new AssetUploader();
  return uploader.uploadAudio(source);
}

/**
 * Quick batch upload for a scene (background + audio).
 */
async function uploadSceneAssets(bgSource, audioSource) {
  const uploader = new AssetUploader();
  return uploader.uploadSceneAssets({
    backgroundVideo: bgSource,
    audio: audioSource,
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  AssetUploader,
  uploadVideo,
  uploadAudio,
  uploadSceneAssets,
  SIZE_LIMITS,
  MIME_TYPES,
  EXT_TO_MIME,
};
