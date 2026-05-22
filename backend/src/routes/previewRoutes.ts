/**
 * previewRoutes.ts - Video Preview API Routes
 * Phase 5: Video Assembly Pipeline
 * 
 * All routes are protected with JWT authentication.
 * Provides endpoints for generating and retrieving video previews,
 * thumbnails, contact sheets, and scene-clip management.
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as previewController from '../controllers/previewController';

const router = Router();

// ─── CLIP PREVIEW ENDPOINTS ─────────────────────────────────────

// POST   /api/preview/clip/:clipId — Generate low-res preview + thumbnail for a clip
router.post('/clip/:clipId', authenticateToken, previewController.generateClipPreviewEndpoint);

// GET    /api/preview/clip/:clipId — Get preview info for a clip
router.get('/clip/:clipId', authenticateToken, previewController.getClipPreview);

// GET    /api/preview/clip/:clipId/file — Serve the preview video file
router.get('/clip/:clipId/file', authenticateToken, previewController.serveClipPreview);

// GET    /api/preview/clip/:clipId/thumbnail — Serve the thumbnail image
router.get('/clip/:clipId/thumbnail', authenticateToken, previewController.serveClipThumbnail);

// GET    /api/preview/clip/:clipId/frames — Extract frame strip for hover preview
router.get('/clip/:clipId/frames', authenticateToken, previewController.getClipFrameStrip);

// POST   /api/preview/clip/:clipId/contact-sheet — Generate contact sheet
router.post('/clip/:clipId/contact-sheet', authenticateToken, previewController.generateClipContactSheet);

// ─── TIMELINE PREVIEW ENDPOINTS ─────────────────────────────────

// POST   /api/preview/timeline/:id — Batch generate previews for all clips in a timeline
router.post('/timeline/:id', authenticateToken, previewController.batchTimelinePreviews);

// GET    /api/preview/timeline/:id — Get preview status for all clips in timeline
router.get('/timeline/:id', authenticateToken, previewController.getTimelinePreviews);

// ─── SCENE PREVIEW ENDPOINTS ────────────────────────────────────

// GET    /api/preview/scene/:sceneId — Get all clips for a scene
router.get('/scene/:sceneId', authenticateToken, previewController.getSceneClips);

// POST   /api/preview/scene/:sceneId — Generate previews for all scene clips
router.post('/scene/:sceneId', authenticateToken, previewController.generateScenePreviews);

// POST   /api/preview/scene/:sceneId/clips — Add a clip to a scene
router.post('/scene/:sceneId/clips', authenticateToken, previewController.addSceneClip);

// PUT    /api/preview/scene/clips/:clipId — Update a scene clip
router.put('/scene/clips/:clipId', authenticateToken, previewController.updateSceneClip);

// DELETE /api/preview/scene/clips/:clipId — Remove a clip from a scene
router.delete('/scene/clips/:clipId', authenticateToken, previewController.removeSceneClip);

// ─── PROBE ENDPOINT ─────────────────────────────────────────────

// POST   /api/preview/probe — Probe video file for metadata
router.post('/probe', authenticateToken, previewController.probeVideo);

export default router;
