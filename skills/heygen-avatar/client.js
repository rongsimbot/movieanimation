/**
 * HeyGen API Client — Base REST API wrapper
 *
 * Handles authentication, request routing, error classification,
 * rate-limit handling, and response parsing for the HeyGen V3 API.
 *
 * Supports:
 * - Avatars (photo avatar creation / listing)
 * - Assets (background video, images, audio upload)
 * - Video Agents (Luma scene + avatar + audio → final render)
 * - Video management (status polling, listing, deletion)
 *
 * @module HeyGenClient
 * @requires node-fetch
 * @requires form-data
 * @requires dotenv
 */

const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Custom Error
// ---------------------------------------------------------------------------

/**
 * Structured HeyGen API error carrying HTTP status and response body.
 */
class HeyGenAPIError extends Error {
  /**
   * @param {string} message   Human-readable error summary
   * @param {number} status    HTTP status code
   * @param {object} [body={}] Response body
   */
  constructor(message, status, body = {}) {
    super(message);
    this.name = 'HeyGenAPIError';
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around the HeyGen V3 REST API.
 *
 * @example
 *   const client = new HeyGenClient({ apiKey: 'sk_...' });
 *   const avatars = await client.getAvatars();
 */
class HeyGenClient {
  /**
   * @param {object}            opts
   * @param {string}           [opts.apiKey]  HeyGen API key (falls back to HEYGEN_API_KEY env var)
   * @param {string}           [opts.baseUrl] Base URL (defaults to https://api.heygen.com/v3)
   * @param {number}           [opts.timeout] Request timeout in ms (default 120_000)
   * @param {typeof fetch}     [opts.fetch]   Fetch implementation (useful for testing)
   */
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || process.env.HEYGEN_API_KEY || '';
    this.baseUrl = opts.baseUrl || 'https://api.heygen.com/v3';
    this.timeout = opts.timeout || 120_000;
    this._fetch = opts.fetch || fetch;

    if (!this.apiKey) {
      throw new HeyGenAPIError(
        'HeyGen API key is required. Set HEYGEN_API_KEY in .env or pass { apiKey } to constructor.',
        401
      );
    }
  }

  // -----------------------------------------------------------------------
  // Core request helper
  // -----------------------------------------------------------------------

  /**
   * Generic authenticated request with retry + error handling.
   *
   * @param {string}  method           HTTP method
   * @param {string}  relPath          Path relative to baseUrl (e.g. '/avatars')
   * @param {object}  [options={}]
   * @param {object}  [options.body]   JSON body (Content-Type: application/json)
   * @param {FormData}|{object} [options.formData] Multipart form (Content-Type: multipart/form-data)
   * @param {object}  [options.query]  Query-string params appended to URL
   * @param {number}  [options.retries] Retry count for 429 / 5xx (default 2)
   * @returns {Promise<object>} Parsed JSON response (the `data` envelope when present)
   */
  async request(method, relPath, options = {}) {
    const { body, formData, query, retries = 2 } = options;

    // Build URL with query params
    const url = new URL(relPath, this.baseUrl);
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      });
    }

    // Build headers
    const headers = { 'X-Api-Key': this.apiKey };

    let requestBody;
    if (formData) {
      // formData can be a native FormData instance or a plain object
      const fd = formData instanceof FormData ? formData : this._buildFormData(formData);
      requestBody = fd;
      // Let node-fetch set the multipart boundary header automatically
    } else if (body) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      let lastError;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await this._fetch(url.toString(), {
            method,
            headers,
            body: requestBody,
            signal: controller.signal,
          });

          // Handle rate limiting
          if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
            lastError = new HeyGenAPIError(
              `Rate limited (429). Retry after ${retryAfter}s`,
              429,
              await this._safeJson(res)
            );
            if (attempt < retries) {
              await this._sleep(retryAfter * 1000);
              continue;
            }
            throw lastError;
          }

          // Handle server errors (retryable)
          if (res.status >= 500) {
            lastError = new HeyGenAPIError(
              `HeyGen server error ${res.status}`,
              res.status,
              await this._safeJson(res)
            );
            if (attempt < retries) {
              await this._sleep(Math.pow(2, attempt) * 1000);
              continue;
            }
            throw lastError;
          }

          // Parse response
          const json = await this._safeJson(res);

          // Handle client errors
          if (!res.ok) {
            throw new HeyGenAPIError(
              json?.message || json?.error || `HeyGen API error ${res.status}`,
              res.status,
              json
            );
          }

          // Unwrap the `data` envelope when present
          return json?.data !== undefined ? json.data : json;
        } catch (err) {
          if (err.name === 'HeyGenAPIError') {
            if (err.status === 429 || err.status >= 500) {
              lastError = err;
              continue; // retry
            }
            throw err; // non-retryable client error
          }
          // Network / abort errors
          if (err.name === 'AbortError' || err.type === 'aborted') {
            throw new HeyGenAPIError(
              `Request timed out after ${this.timeout}ms`,
              0,
              {}
            );
          }
          lastError = err;
          if (attempt < retries) {
            await this._sleep(Math.pow(2, attempt) * 1000);
            continue;
          }
          throw err;
        }
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  // -----------------------------------------------------------------------
  // Avatars
  // -----------------------------------------------------------------------

  /**
   * List all avatars (public + private).
   * @returns {Promise<object>}
   */
  async getAvatars() {
    return this.request('GET', '/avatars');
  }

  /**
   * Get a specific avatar group by ID.
   * @param {string} groupId
   * @returns {Promise<object>}
   */
  async getAvatar(groupId) {
    return this.request('GET', `/avatars/${groupId}`);
  }

  /**
   * Create a photo avatar from a local image file.
   *
   * POST /v3/avatars with multipart/form-data containing the photo.
   *
   * @param {string}  photoFilePath  Absolute or relative path to a JPEG/PNG
   * @param {object}  [options={}]
   * @param {string}  [options.name] Display name for the avatar
   * @param {string}  [options.gender] 'male' | 'female'
   * @returns {Promise<object>} Created avatar details including group_id and looks
   */
  async createAvatar(photoFilePath, options = {}) {
    if (!fs.existsSync(photoFilePath)) {
      throw new HeyGenAPIError(
        `Photo file not found: ${photoFilePath}`,
        0
      );
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(photoFilePath));

    if (options.name) formData.append('name', options.name);
    if (options.gender) formData.append('gender', options.gender);

    // The HeyGen v3 avatar creation endpoint accepts multipart upload
    const result = await this.request('POST', '/avatars', {
      formData,
      retries: 1,
    });

    // HeyGen returns { avatar_group_id, looks: [...] }
    return result;
  }

  /**
   * Get available looks for an avatar group.
   *
   * @param {string} groupId  Avatar group ID
   * @returns {Promise<object>} Array of look objects with look_id, name, thumbnail
   */
  async getAvatarLooks(groupId) {
    return this.request('GET', '/avatars/looks', {
      query: { avatar_group_id: groupId },
    });
  }

  // -----------------------------------------------------------------------
  // Assets (background video, images, audio)
  // -----------------------------------------------------------------------

  /**
   * Upload a file asset (video, image, or audio) to HeyGen.
   *
   * POST /v3/assets with multipart/form-data.
   *
   * @param {string}  filePath  Path to the local file
   * @returns {Promise<object>} { asset_id, url, mime_type, size_bytes }
   */
  async uploadAsset(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new HeyGenAPIError(`Asset file not found: ${filePath}`, 0);
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    return this.request('POST', '/assets', { formData });
  }

  /**
   * Upload an asset from a URL (download → re-upload).
   *
   * @param {string}  url        Publicly accessible file URL
   * @param {string}  [filename] Local temp filename (auto-generated if omitted)
   * @returns {Promise<object>} { asset_id, url, mime_type, size_bytes }
   */
  async uploadAssetFromUrl(url, filename) {
    const res = await this._fetch(url);
    if (!res.ok) {
      throw new HeyGenAPIError(
        `Failed to download asset from URL: ${res.status} ${res.statusText}`,
        res.status
      );
    }

    const buffer = await res.buffer();
    const ext = path.extname(new URL(url).pathname) || '.mp4';
    const tmpPath = filename || path.join(require('os').tmpdir(), `heygen_asset_${Date.now()}${ext}`);

    fs.writeFileSync(tmpPath, buffer);
    try {
      const result = await this.uploadAsset(tmpPath);
      return result;
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort */ }
    }
  }

  /**
   * List uploaded assets.
   *
   * @param {number} [limit=20]  Items per page
   * @param {number} [offset=0]  Pagination offset
   * @returns {Promise<object>}
   */
  async listAssets(limit = 20, offset = 0) {
    return this.request('GET', '/assets', {
      query: { limit, offset },
    });
  }

  // -----------------------------------------------------------------------
  // Video Agents (V3)
  // -----------------------------------------------------------------------

  /**
   * Generate a video using the V3 Video Agent API.
   *
   * POST /v3/video-agents
   *
   * Combines a photo avatar, custom background video (Luma scene),
   * and external audio (ElevenLabs) into a single rendered video.
   *
   * @param {object}   params
   * @param {string}   params.prompt        Scene description / direction for the avatar
   * @param {string}   params.avatarId      HeyGen avatar look ID (e.g. 'look_ben_01')
   * @param {string[]} [params.assetIds]    Asset IDs to include (background + audio)
   * @param {string}   [params.orientation] 'landscape' | 'portrait' (default 'landscape')
   * @param {string}   [params.callbackUrl] Webhook URL for async completion notification
   * @param {number}   [params.width]       Video width in pixels (default 1920)
   * @param {number}   [params.height]      Video height in pixels (default 1080)
   * @returns {Promise<object>} { session_id, status }
   */
  async generateVideo(params) {
    const {
      prompt,
      avatarId,
      assetIds = [],
      orientation = 'landscape',
      callbackUrl,
      width,
      height,
    } = params;

    if (!prompt) throw new HeyGenAPIError('prompt is required for video generation', 400);
    if (!avatarId) throw new HeyGenAPIError('avatarId is required for video generation', 400);

    const body = {
      prompt,
      avatar_id: avatarId,
      orientation,
    };

    if (assetIds.length > 0) {
      body.files = assetIds.map(id => ({ type: 'asset_id', asset_id: id }));
    }

    if (callbackUrl) body.callback_url = callbackUrl;
    if (width) body.width = width;
    if (height) body.height = height;

    return this.request('POST', '/video-agents', { body });
  }

  /**
   * Get the status / result of a Video Agent session.
   *
   * @param {string} sessionId  Session ID returned by generateVideo()
   * @returns {Promise<object>} Session data including video_id when ready
   */
  async getVideoAgentSession(sessionId) {
    return this.request('GET', `/video-agents/${sessionId}`);
  }

  // -----------------------------------------------------------------------
  // Video management
  // -----------------------------------------------------------------------

  /**
   * Get the status and metadata for a generated video.
   *
   * @param {string} videoId  HeyGen video ID
   * @returns {Promise<object>} { id, status, video_url, thumbnail_url, duration, ... }
   */
  async getVideoStatus(videoId) {
    return this.request('GET', `/videos/${videoId}`);
  }

  /**
   * List generated videos.
   *
   * @param {number} [limit=20]
   * @param {number} [offset=0]
   * @returns {Promise<object>}
   */
  async listVideos(limit = 20, offset = 0) {
    return this.request('GET', '/videos', {
      query: { limit, offset },
    });
  }

  /**
   * Delete a generated video.
   *
   * @param {string} videoId  HeyGen video ID
   * @returns {Promise<object>}
   */
  async deleteVideo(videoId) {
    return this.request('DELETE', `/videos/${videoId}`);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Build a FormData instance from a plain object { field: value|Buffer|ReadStream } */
  _buildFormData(fields) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value) && !value._readableState) {
        fd.append(key, JSON.stringify(value));
      } else {
        fd.append(key, value);
      }
    }
    return fd;
  }

  /** Safely parse JSON, returning null on failure */
  async _safeJson(res) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  /** Promise-based delay */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _defaultClient = null;

/**
 * Return (or create) the default singleton HeyGenClient using
 * `HEYGEN_API_KEY` from the environment.
 *
 * @returns {HeyGenClient}
 */
function getDefaultClient() {
  if (!_defaultClient) {
    _defaultClient = new HeyGenClient();
  }
  return _defaultClient;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  HeyGenClient,
  HeyGenAPIError,
  getDefaultClient,
};
