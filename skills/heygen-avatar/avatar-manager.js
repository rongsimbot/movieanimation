/**
 * Avatar Manager — Photo avatar lifecycle management for MovieAnimation.ai
 *
 * Handles:
 * - Creating photo avatars from local images (Ben, Sarah, custom characters)
 * - Caching avatar group/look IDs for reuse across scenes
 * - Listing and retrieving avatar metadata
 * - Look selection for different styles/costumes per scene
 * - Integration with PostgreSQL heygen_avatars table
 *
 * Key concept: A "photo avatar" in HeyGen has a group_id (the avatar entity)
 * and one or more look_ids (specific appearances/styles). We store both
 * in the database so subsequent scene generations can reference them
 * without re-uploading photos.
 *
 * @module avatar-manager
 * @requires ./client
 * @requires dotenv
 */

const { getDefaultClient, HeyGenAPIError } = require('./client');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Default character configuration
// ---------------------------------------------------------------------------

/**
 * Pre-defined MovieAnimation character configs.
 * Point `photoPath` to actual photo files when available.
 */
const DEFAULT_CHARACTERS = {
  ben: {
    name: 'Ben',
    gender: 'male',
    photoPath: process.env.HEYGEN_BEN_PHOTO_PATH || null,
    description: 'Ben — lead character for diner noir scenes',
  },
  sarah: {
    name: 'Sarah',
    gender: 'female',
    photoPath: process.env.HEYGEN_SARAH_PHOTO_PATH || null,
    description: 'Sarah — lead character for diner noir scenes',
  },
};

// ---------------------------------------------------------------------------
// AvatarManager
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of HeyGen Photo Avatars.
 *
 * Avatars are created once from a photo and then referenced by their
 * look_id across all scene generations. The manager handles:
 * - Creation from photo files
 * - ID caching (in-memory + optional database persistence)
 * - Look discovery and selection
 * - Bulk creation for initial setup
 *
 * @example
 *   const mgr = new AvatarManager();
 *
 *   // Create Ben's avatar (once)
 *   const ben = await mgr.getOrCreate('ben', '/photos/ben_headshot.jpg');
 *   console.log(ben.lookId);  // "look_abc123"
 *
 *   // Later scenes just reference the cached ID
 *   const benAgain = await mgr.getOrCreate('ben'); // returns cached
 */
class AvatarManager {
  /**
   * @param {object}      [opts]
   * @param {HeyGenClient} [opts.client]  HeyGen API client
   * @param {object}      [opts.db]       Database pool/connection (optional — for PostgreSQL persistence)
   * @param {object}      [opts.characters] Custom character definitions (merges with defaults)
   */
  constructor(opts = {}) {
    this.client = opts.client || getDefaultClient();
    this.db = opts.db || null;
    this.characters = { ...DEFAULT_CHARACTERS, ...opts.characters };

    /** In-memory cache: characterKey → { groupId, lookId, status, ... } */
    this._cache = new Map();
    /** In-memory cache: groupId → looks[] */
    this._lookCache = new Map();
  }

  // -----------------------------------------------------------------------
  // Public API — avatar lifecycle
  // -----------------------------------------------------------------------

  /**
   * Get or create an avatar for a character.
   *
   * If the avatar already exists (in cache or database), returns it.
   * Otherwise uploads the photo and creates a new photo avatar.
   *
   * @param {string}  characterKey  'ben' | 'sarah' | custom key
   * @param {string}  [photoPath]   Path to photo (required for first creation)
   * @param {object}  [opts]
   * @param {string}  [opts.name]   Display name override
   * @param {string}  [opts.gender] Gender override
   * @returns {Promise<AvatarRecord>}
   */
  async getOrCreate(characterKey, photoPath, opts = {}) {
    // 1. Check in-memory cache
    if (this._cache.has(characterKey)) {
      return this._cache.get(characterKey);
    }

    // 2. Check database (if available)
    if (this.db) {
      const dbRecord = await this._findInDb(characterKey);
      if (dbRecord) {
        const record = this._toRecord(dbRecord);
        this._cache.set(characterKey, record);
        return record;
      }
    }

    // 3. Create new
    const charConfig = this.characters[characterKey] || {};
    const photo = photoPath || charConfig.photoPath || opts.photoPath;

    if (!photo) {
      throw new HeyGenAPIError(
        `No photo path provided for character "${characterKey}" and none configured. Provide photoPath.`,
        400
      );
    }

    return this.create(characterKey, photo, {
      name: opts.name || charConfig.name || characterKey,
      gender: opts.gender || charConfig.gender,
    });
  }

  /**
   * Create a new photo avatar from an image file.
   *
   * @param {string} characterKey  Key used for caching ('ben', 'sarah', etc.)
   * @param {string} photoPath     Path to photo file (JPEG or PNG)
   * @param {object} [opts]
   * @param {string} [opts.name]   Display name
   * @param {string} [opts.gender] 'male' | 'female'
   * @returns {Promise<AvatarRecord>}
   */
  async create(characterKey, photoPath, opts = {}) {
    if (!fs.existsSync(photoPath)) {
      throw new HeyGenAPIError(`Photo file not found: ${photoPath}`, 0);
    }

    console.log(`[heygen-avatar] Creating photo avatar for "${characterKey}" from ${photoPath}...`);

    // 1. Upload photo to HeyGen as an asset first (for avatar creation)
    const asset = await this.client.uploadAsset(photoPath);

    // 2. Create avatar — HeyGen v3 POST /v3/avatars
    const avatar = await this.client.createAvatar(photoPath, {
      name: opts.name || characterKey,
      gender: opts.gender,
    });

    // 3. Extract IDs
    const groupId = avatar.avatar_group_id || avatar.group_id || avatar.id;
    const looks = avatar.looks || [];
    const defaultLook = looks.length > 0 ? looks[0] : null;
    const lookId = defaultLook?.look_id || defaultLook?.id || avatar.look_id;

    // 4. Cache
    const record = {
      characterKey,
      name: opts.name || characterKey,
      groupId,
      lookId,
      assetId: asset?.asset_id || null,
      status: 'active',
      looks,
      createdAt: new Date().toISOString(),
    };

    this._cache.set(characterKey, record);
    if (looks.length > 0) this._lookCache.set(groupId, looks);

    // 5. Persist to database
    if (this.db) {
      await this._saveToDb(record);
    }

    console.log(`[heygen-avatar] ✅ Avatar created: ${characterKey} → groupId=${groupId}, lookId=${lookId}`);

    return record;
  }

  /**
   * List all cached/known avatars.
   *
   * @param {object}      [opts]
   * @param {boolean}     [opts.refresh]  Re-fetch from HeyGen API
   * @returns {Promise<AvatarRecord[]>}
   */
  async list(opts = {}) {
    if (opts.refresh || this._cache.size === 0) {
      try {
        const avatars = await this.client.getAvatars();
        // Refresh the look cache
        for (const av of Array.isArray(avatars) ? avatars : (avatars?.items || [])) {
          const groupId = av.avatar_group_id || av.group_id || av.id;
          if (groupId) {
            try {
              const looks = await this.client.getAvatarLooks(groupId);
              this._lookCache.set(groupId, Array.isArray(looks) ? looks : (looks?.looks || []));
            } catch (_) { /* not all avatars have looks */ }
          }
        }
      } catch (err) {
        console.warn('[heygen-avatar] Failed to refresh avatars from API:', err.message);
      }
    }

    return Array.from(this._cache.values());
  }

  /**
   * Get available looks/styles for an avatar group.
   *
   * @param {string} groupId  Avatar group ID
   * @returns {Promise<Array<{look_id: string, name: string, thumbnail_url?: string}>>}
   */
  async getLooks(groupId) {
    if (this._lookCache.has(groupId)) {
      return this._lookCache.get(groupId);
    }

    try {
      const looks = await this.client.getAvatarLooks(groupId);
      const list = Array.isArray(looks) ? looks : (looks?.looks || []);
      this._lookCache.set(groupId, list);
      return list;
    } catch (err) {
      console.warn(`[heygen-avatar] Failed to fetch looks for group ${groupId}:`, err.message);
      return [];
    }
  }

  /**
   * Get a specific look by character key (uses cached default look).
   *
   * @param {string} characterKey  'ben' | 'sarah'
   * @returns {Promise<AvatarRecord | null>}
   */
  async get(characterKey) {
    if (this._cache.has(characterKey)) {
      return this._cache.get(characterKey);
    }
    if (this.db) {
      const dbRecord = await this._findInDb(characterKey);
      if (dbRecord) {
        const record = this._toRecord(dbRecord);
        this._cache.set(characterKey, record);
        return record;
      }
    }
    return null;
  }

  /**
   * Initialize default characters (Ben + Sarah) from configured photo paths.
   *
   * Call this once during app startup to ensure all required avatars exist.
   *
   * @returns {Promise<{ben: AvatarRecord, sarah: AvatarRecord}>}
   */
  async initializeDefaults() {
    const results = {};

    for (const [key, config] of Object.entries(this.characters)) {
      if (config.photoPath) {
        try {
          results[key] = await this.getOrCreate(key, config.photoPath);
        } catch (err) {
          console.error(`[heygen-avatar] Failed to initialize avatar "${key}":`, err.message);
          results[key] = { error: err.message };
        }
      } else {
        console.warn(`[heygen-avatar] Skipping "${key}" — no photoPath configured`);
      }
    }

    return results;
  }

  /**
   * Delete an avatar (from cache, DB, and optionally HeyGen).
   *
   * @param {string}  characterKey
   * @param {boolean} [fromHeyGen=false] Also delete from HeyGen
   */
  async delete(characterKey, fromHeyGen = false) {
    const record = this._cache.get(characterKey);
    if (!record && !this.db) {
      throw new HeyGenAPIError(`Avatar "${characterKey}" not found`, 404);
    }

    if (fromHeyGen && record?.groupId) {
      try {
        // Note: HeyGen v3 may not have a DELETE /avatars endpoint yet
        // Check https://developers.heygen.com for updates
        console.warn('[heygen-avatar] HeyGen avatar deletion may not be supported in current API version.');
      } catch (_) { /* best-effort */ }
    }

    this._cache.delete(characterKey);
    if (this.db) {
      await this._deleteFromDb(characterKey);
    }

    console.log(`[heygen-avatar] Avatar "${characterKey}" removed from cache${this.db ? ' and database' : ''}`);
  }

  /**
   * Clear the in-memory cache (forces re-fetch from DB/API on next access).
   */
  clearCache() {
    this._cache.clear();
    this._lookCache.clear();
  }

  // -----------------------------------------------------------------------
  // Database helpers (optional PostgreSQL integration)
  // -----------------------------------------------------------------------

  async _findInDb(characterKey) {
    try {
      const result = await this.db.query(
        'SELECT * FROM heygen_avatars WHERE character_name = $1 AND status = $2 LIMIT 1',
        [characterKey, 'active']
      );
      return result.rows?.[0] || null;
    } catch (err) {
      console.warn('[heygen-avatar] Database query failed (continuing without DB):', err.message);
      return null;
    }
  }

  async _saveToDb(record) {
    try {
      await this.db.query(
        `INSERT INTO heygen_avatars (character_name, avatar_group_id, default_look_id, photo_url, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (character_name) DO UPDATE
         SET avatar_group_id = $2, default_look_id = $3, photo_url = $4, status = $5, updated_at = NOW()`,
        [record.characterKey, record.groupId, record.lookId, record.photoUrl || null, record.status]
      );
    } catch (err) {
      console.warn('[heygen-avatar] Database save failed (continuing):', err.message);
    }
  }

  async _deleteFromDb(characterKey) {
    try {
      await this.db.query(
        'UPDATE heygen_avatars SET status = $1, updated_at = NOW() WHERE character_name = $2',
        ['deleted', characterKey]
      );
    } catch (err) {
      console.warn('[heygen-avatar] Database delete failed (continuing):', err.message);
    }
  }

  _toRecord(row) {
    return {
      characterKey: row.character_name,
      name: row.name || row.character_name,
      groupId: row.avatar_group_id,
      lookId: row.default_look_id,
      photoUrl: row.photo_url,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

/**
 * Quick create/get for a single character using defaults.
 */
async function getOrCreateAvatar(characterKey, photoPath, opts) {
  const mgr = new AvatarManager();
  return mgr.getOrCreate(characterKey, photoPath, opts);
}

/**
 * Initialize Ben and Sarah from environment-configured photo paths.
 */
async function initializeDefaultAvatars() {
  const mgr = new AvatarManager();
  return mgr.initializeDefaults();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  AvatarManager,
  getOrCreateAvatar,
  initializeDefaultAvatars,
  DEFAULT_CHARACTERS,
};

/**
 * @typedef {object} AvatarRecord
 * @property {string}   characterKey  Internal key ('ben', 'sarah')
 * @property {string}   name          Display name
 * @property {string}   groupId       HeyGen avatar group ID
 * @property {string}   lookId        Default look ID for video generation
 * @property {string}   [assetId]     Uploaded photo asset ID
 * @property {string}   status        'active' | 'deleted'
 * @property {Array}    [looks]       Available looks/styles
 * @property {string}   [photoUrl]    Original photo URL
 * @property {string}   createdAt     ISO timestamp
 */
