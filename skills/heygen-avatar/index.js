/**
 * HeyGen Avatar Skill — Main Export
 *
 * MovieAnimation.ai skill for programmatic HeyGen API integration.
 * Orchestrates: Luma scene + ElevenLabs audio → avatar video generation.
 *
 * Usage:
 *   const { HeyGenClient, AvatarManager, SceneGenerator, BatchProcessor } = require('./skills/heygen-avatar');
 */

const { HeyGenClient, HeyGenAPIError, getDefaultClient } = require('./client');
const { AvatarManager, getOrCreateAvatar, initializeDefaultAvatars } = require('./avatar-manager');
const { SceneGenerator, generateScene } = require('./scene-generator');
const { BatchProcessor, createBatchProcessor } = require('./batch-processor');
const { AssetUploader, uploadVideo, uploadAudio, uploadSceneAssets } = require('./utils/asset-uploader');
const { VideoPoller, waitForVideo, waitForSession } = require('./utils/poller');

module.exports = {
  // Core
  HeyGenClient,
  HeyGenAPIError,
  getDefaultClient,

  // Avatar Management
  AvatarManager,
  getOrCreateAvatar,
  initializeDefaultAvatars,

  // Scene Generation
  SceneGenerator,
  generateScene,

  // Batch Processing
  BatchProcessor,
  createBatchProcessor,

  // Asset Upload
  AssetUploader,
  uploadVideo,
  uploadAudio,
  uploadSceneAssets,

  // Polling
  VideoPoller,
  waitForVideo,
  waitForSession,
};
