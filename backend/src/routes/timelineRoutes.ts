/**
 * timelineRoutes.ts - Timeline Assembly API Routes
 * Phase 7: Video Assembly
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as timelineController from '../controllers/timelineController';

const router = Router();

// All timeline routes are protected
// ─── TIMELINE CRUD ──────────────────────────────────────────────

// POST   /api/timelines — Create a new timeline
router.post('/', authenticateToken, timelineController.createTimeline);

// GET    /api/timelines/project/:projectId — List timelines for a project
router.get('/project/:projectId', authenticateToken, timelineController.getTimelines);

// GET    /api/timelines/:id — Get timeline with all clips
router.get('/:id', authenticateToken, timelineController.getTimeline);

// DELETE /api/timelines/:id — Delete a timeline
router.delete('/:id', authenticateToken, timelineController.deleteTimeline);

// ─── CLIP MANAGEMENT ────────────────────────────────────────────

// POST   /api/timelines/:id/clips — Add a clip to the timeline
router.post('/:id/clips', authenticateToken, timelineController.addClip);

// PUT    /api/timelines/:id/clips/reorder — Reorder clips
router.put('/:id/clips/reorder', authenticateToken, timelineController.reorderClips);

// PUT    /api/timelines/:id/clips/bulk — Bulk set all clips at once
router.put('/:id/clips/bulk', authenticateToken, timelineController.bulkSetClips);

// PUT    /api/timelines/:id/clips/:clipId — Update a clip
router.put('/:id/clips/:clipId', authenticateToken, timelineController.updateClip);

// DELETE /api/timelines/:id/clips/:clipId — Remove a clip
router.delete('/:id/clips/:clipId', authenticateToken, timelineController.removeClip);

// ─── ASSEMBLY ───────────────────────────────────────────────────

// POST   /api/timelines/:id/assemble — Start video assembly
router.post('/:id/assemble', authenticateToken, timelineController.startAssembly);

// GET    /api/timelines/:id/assembly-status — Get assembly progress
router.get('/:id/assembly-status', authenticateToken, timelineController.getAssemblyStatus);

export default router;
