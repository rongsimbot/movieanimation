/**
 * previewController.ts - Video Preview API Controller
 * Phase 5: Video Assembly Pipeline
 * 
 * Endpoints for generating and managing low-res video previews,
 * thumbnails, and contact sheets for timeline clips and scenes.
 */

import { Request, Response } from 'express';
import * as timelineModel from '../models/timelineModel';
import {
  generateClipPreview,
  generateThumbnail,
  generateContactSheet,
  batchGeneratePreviews,
  extractFrameStrip,
  generateFullPreview,
  probeClip,
} from '../services/videoPreview';
import pool from '../config/database';
import path from 'path';
import fs from 'fs';

// ─── CLIP PREVIEW ───────────────────────────────────────────────

/**
 * POST /api/preview/clip/:clipId
 * Generate a low-res preview for a specific timeline clip.
 */
export async function generateClipPreviewEndpoint(req: Request, res: Response) {
  try {
    const clipId = parseInt(req.params.clipId);
    if (isNaN(clipId)) return res.status(400).json({ error: 'Invalid clip ID' });

    const clip = await timelineModel.getTimelineClip(clipId);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });

    if (!clip.clip_source || !fs.existsSync(clip.clip_source)) {
      return res.status(400).json({ error: 'Clip has no video source or file not found' });
    }

    const { resolution = '360p', includeAudio = false, generateThumbnail: genThumb = true } = req.body;

    // Update clip status to generating
    await timelineModel.updateClip(clipId, { status: 'processing' });
    await pool.query(
      'UPDATE timeline_clips SET preview_status = $1 WHERE id = $2',
      ['generating', clipId]
    );

    // Generate preview
    const result = await generateClipPreview(clip.clip_source, undefined, {
      resolution,
      includeAudio,
    });

    // Generate thumbnail if requested
    let thumbnailPath: string | undefined;
    if (genThumb) {
      try {
        const thumb = await generateThumbnail(clip.clip_source);
        thumbnailPath = thumb.thumbnailPath;
      } catch {}
    }

    // Update clip with preview paths
    await pool.query(
      'UPDATE timeline_clips SET preview_path = $1, thumbnail_path = $2, preview_status = $3 WHERE id = $4',
      [result.previewPath, thumbnailPath || null, 'ready', clipId]
    );
    await timelineModel.updateClip(clipId, { status: 'ready' });

    res.json({
      clipId,
      previewPath: result.previewPath,
      thumbnailPath,
      previewResolution: result.previewResolution,
      fileSize: result.fileSize,
      status: 'ready',
    });
  } catch (error: any) {
    // Reset status on failure
    try {
      const clipId = parseInt(req.params.clipId);
      if (!isNaN(clipId)) {
        await pool.query(
          'UPDATE timeline_clips SET preview_status = $1 WHERE id = $2',
          ['failed', clipId]
        );
        await timelineModel.updateClip(clipId, { status: 'failed' });
      }
    } catch {}
    
    res.status(500).json({ error: 'Failed to generate clip preview', details: error.message });
  }
}

/**
 * GET /api/preview/clip/:clipId
 * Get preview info for a clip.
 */
export async function getClipPreview(req: Request, res: Response) {
  try {
    const clipId = parseInt(req.params.clipId);
    if (isNaN(clipId)) return res.status(400).json({ error: 'Invalid clip ID' });

    const clip = await timelineModel.getTimelineClip(clipId);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });

    // Query for preview fields
    const result = await pool.query(
      'SELECT preview_path, thumbnail_path, preview_status FROM timeline_clips WHERE id = $1',
      [clipId]
    );

    const preview = result.rows[0] || {};

    res.json({
      clipId,
      clipSource: clip.clip_source,
      previewPath: preview.preview_path || null,
      thumbnailPath: preview.thumbnail_path || null,
      previewStatus: preview.preview_status || 'none',
      clipStatus: clip.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get clip preview', details: error.message });
  }
}

/**
 * GET /api/preview/clip/:clipId/file
 * Serve the preview video file.
 */
export async function serveClipPreview(req: Request, res: Response) {
  try {
    const clipId = parseInt(req.params.clipId);
    if (isNaN(clipId)) return res.status(400).json({ error: 'Invalid clip ID' });

    const result = await pool.query(
      'SELECT preview_path, preview_status FROM timeline_clips WHERE id = $1',
      [clipId]
    );

    const row = result.rows[0];
    if (!row?.preview_path) {
      return res.status(404).json({ error: 'Preview not generated yet' });
    }

    if (!fs.existsSync(row.preview_path)) {
      return res.status(404).json({ error: 'Preview file not found on disk' });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(row.preview_path);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to serve preview', details: error.message });
  }
}

/**
 * GET /api/preview/clip/:clipId/thumbnail
 * Serve the thumbnail image for a clip.
 */
export async function serveClipThumbnail(req: Request, res: Response) {
  try {
    const clipId = parseInt(req.params.clipId);
    if (isNaN(clipId)) return res.status(400).json({ error: 'Invalid clip ID' });

    const result = await pool.query(
      'SELECT thumbnail_path FROM timeline_clips WHERE id = $1',
      [clipId]
    );

    const row = result.rows[0];
    if (!row?.thumbnail_path) {
      return res.status(404).json({ error: 'Thumbnail not generated yet' });
    }

    if (!fs.existsSync(row.thumbnail_path)) {
      return res.status(404).json({ error: 'Thumbnail file not found on disk' });
    }

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(row.thumbnail_path);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to serve thumbnail', details: error.message });
  }
}

// ─── TIMELINE PREVIEWS ──────────────────────────────────────────

/**
 * POST /api/preview/timeline/:id
 * Batch generate previews for all clips in a timeline.
 */
export async function batchTimelinePreviews(req: Request, res: Response) {
  try {
    const timelineId = parseInt(req.params.id);
    if (isNaN(timelineId)) return res.status(400).json({ error: 'Invalid timeline ID' });

    const timeline = await timelineModel.getTimelineWithClips(timelineId);
    if (!timeline) return res.status(404).json({ error: 'Timeline not found' });

    if (!timeline.clips || timeline.clips.length === 0) {
      return res.status(400).json({ error: 'Timeline has no clips' });
    }

    const { resolution = '360p', thumbnails = true, contactSheets = false } = req.body;

    // Create preview job record
    const userId = (req as any).user?.id || null;
    const jobResult = await pool.query(
      `INSERT INTO preview_jobs (user_id, entity_type, entity_id, total_clips, status, started_at)
       VALUES ($1, 'timeline', $2, $3, 'processing', NOW())
       RETURNING id`,
      [userId, timelineId, timeline.clips.length]
    );
    const jobId = jobResult.rows[0].id;

    // Filter clips that have valid sources
    const validClips = timeline.clips
      .filter(c => c.clip_source && fs.existsSync(c.clip_source))
      .sort((a, b) => a.clip_order - b.clip_order);

    const clipPaths = validClips.map(c => c.clip_source!);

    // Mark all clips as generating
    for (const clip of validClips) {
      await pool.query(
        'UPDATE timeline_clips SET preview_status = $1 WHERE id = $2',
        ['generating', clip.id]
      );
    }

    // Generate previews in batch
    const batchResult = await batchGeneratePreviews(
      clipPaths,
      { preview: { resolution }, thumbnails },
      async (current, total, clipPath) => {
        await pool.query(
          'UPDATE preview_jobs SET completed_clips = $1 WHERE id = $2',
          [current, jobId]
        );
      }
    );

    // Update clips with preview paths
    for (const clip of validClips) {
      const result = batchResult.results[clip.clip_source!];
      if (result) {
        await pool.query(
          'UPDATE timeline_clips SET preview_path = $1, thumbnail_path = $2, preview_status = $3 WHERE id = $4',
          [result.previewPath, result.thumbnailPath || null, 'ready', clip.id]
        );
      } else {
        await pool.query(
          'UPDATE timeline_clips SET preview_status = $1 WHERE id = $2',
          ['failed', clip.id]
        );
      }
    }

    // Update job status
    const finalStatus = batchResult.failed === 0 ? 'completed' : 'completed';
    await pool.query(
      'UPDATE preview_jobs SET status = $1, completed_clips = $2, completed_at = NOW() WHERE id = $3',
      [finalStatus, batchResult.success, jobId]
    );

    // Update timeline status if needed
    await timelineModel.updateTimeline(timelineId, {});

    res.json({
      jobId,
      timelineId,
      ...batchResult,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate timeline previews', details: error.message });
  }
}

/**
 * GET /api/preview/timeline/:id
 * Get preview generation status for all clips in a timeline.
 */
export async function getTimelinePreviews(req: Request, res: Response) {
  try {
    const timelineId = parseInt(req.params.id);
    if (isNaN(timelineId)) return res.status(400).json({ error: 'Invalid timeline ID' });

    const timeline = await timelineModel.getTimelineWithClips(timelineId);
    if (!timeline) return res.status(404).json({ error: 'Timeline not found' });

    const clips = timeline.clips.map(c => ({
      id: c.id,
      clipOrder: c.clip_order,
      label: c.label,
      clipSource: c.clip_source,
    }));

    // Get preview fields for all clips
    const previewResult = await pool.query(
      'SELECT id, preview_path, thumbnail_path, preview_status FROM timeline_clips WHERE timeline_id = $1 ORDER BY clip_order',
      [timelineId]
    );

    const previews = previewResult.rows.map(r => ({
      id: r.id,
      previewPath: r.preview_path,
      thumbnailPath: r.thumbnail_path,
      previewStatus: r.preview_status,
    }));

    // Get latest preview job
    const jobResult = await pool.query(
      'SELECT * FROM preview_jobs WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT 1',
      ['timeline', timelineId]
    );

    res.json({
      timelineId,
      clipCount: clips.length,
      previews,
      latestJob: jobResult.rows[0] || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get timeline previews', details: error.message });
  }
}

// ─── SCENE CLIP PREVIEWS ────────────────────────────────────────

/**
 * GET /api/preview/scene/:sceneId
 * Get clips associated with a scene.
 */
export async function getSceneClips(req: Request, res: Response) {
  try {
    const sceneId = parseInt(req.params.sceneId);
    if (isNaN(sceneId)) return res.status(400).json({ error: 'Invalid scene ID' });

    const result = await pool.query(
      'SELECT * FROM scene_clips WHERE scene_id = $1 ORDER BY created_at ASC',
      [sceneId]
    );

    res.json({ sceneId, clips: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get scene clips', details: error.message });
  }
}

/**
 * POST /api/preview/scene/:sceneId
 * Generate previews for all clips in a scene.
 */
export async function generateScenePreviews(req: Request, res: Response) {
  try {
    const sceneId = parseInt(req.params.sceneId);
    if (isNaN(sceneId)) return res.status(400).json({ error: 'Invalid scene ID' });

    const clips = await pool.query(
      'SELECT * FROM scene_clips WHERE scene_id = $1',
      [sceneId]
    );

    if (clips.rows.length === 0) {
      return res.status(400).json({ error: 'Scene has no clips' });
    }

    const { resolution = '360p', thumbnails = true } = req.body;
    const clipPaths = clips.rows
      .filter((c: any) => c.clip_source && fs.existsSync(c.clip_source))
      .map((c: any) => c.clip_source);

    // Create preview job
    const userId = (req as any).user?.id || null;
    const jobResult = await pool.query(
      `INSERT INTO preview_jobs (user_id, entity_type, entity_id, total_clips, status, started_at)
       VALUES ($1, 'scene', $2, $3, 'processing', NOW())
       RETURNING id`,
      [userId, sceneId, clipPaths.length]
    );
    const jobId = jobResult.rows[0].id;

    // Batch generate
    const batchResult = await batchGeneratePreviews(
      clipPaths,
      { preview: { resolution }, thumbnails },
      async (current) => {
        await pool.query(
          'UPDATE preview_jobs SET completed_clips = $1 WHERE id = $2',
          [current, jobId]
        );
      }
    );

    // Update scene_clips with preview paths
    for (const clip of clips.rows) {
      const result = batchResult.results[clip.clip_source];
      if (result) {
        await pool.query(
          'UPDATE scene_clips SET preview_path = $1, thumbnail_path = $2, preview_status = $3 WHERE id = $4',
          [result.previewPath, result.thumbnailPath || null, 'ready', clip.id]
        );
      }
    }

    // Complete the job
    await pool.query(
      'UPDATE preview_jobs SET status = $1, completed_clips = $2, completed_at = NOW() WHERE id = $3',
      ['completed', batchResult.success, jobId]
    );

    res.json({
      jobId,
      sceneId,
      ...batchResult,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate scene previews', details: error.message });
  }
}

// ─── FRAME STRIP (Timeline Hover Preview) ───────────────────────

/**
 * GET /api/preview/clip/:clipId/frames
 * Extract a strip of low-res frames for timeline hover preview.
 */
export async function getClipFrameStrip(req: Request, res: Response) {
  try {
    const clipId = parseInt(req.params.clipId);
    if (isNaN(clipId)) return res.status(400).json({ error: 'Invalid clip ID' });

    const clip = await timelineModel.getTimelineClip(clipId);
    if (!clip?.clip_source || !fs.existsSync(clip.clip_source)) {
      return res.status(404).json({ error: 'Clip source not found' });
    }

    const count = parseInt(req.query.count as string) || 10;
    const frames = await extractFrameStrip(clip.clip_source, count);

    res.json({ clipId, frameCount: frames.length, frames });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to extract frames', details: error.message });
  }
}

// ─── CONTACT SHEET ──────────────────────────────────────────────

/**
 * POST /api/preview/clip/:clipId/contact-sheet
 * Generate a contact sheet for a clip.
 */
export async function generateClipContactSheet(req: Request, res: Response) {
  try {
    const clipId = parseInt(req.params.clipId);
    if (isNaN(clipId)) return res.status(400).json({ error: 'Invalid clip ID' });

    const clip = await timelineModel.getTimelineClip(clipId);
    if (!clip?.clip_source || !fs.existsSync(clip.clip_source)) {
      return res.status(404).json({ error: 'Clip source not found' });
    }

    const { columns = 5, rows = 3, cellWidth = 160 } = req.body;
    const result = await generateContactSheet(clip.clip_source, undefined, {
      columns,
      rows,
      cellWidth,
    });

    res.json({
      clipId,
      contactSheetPath: result.contactSheetPath,
      frameCount: result.frameCount,
      fileSize: result.fileSize,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to generate contact sheet', details: error.message });
  }
}

// ─── PROBE ──────────────────────────────────────────────────────

/**
 * POST /api/preview/probe
 * Probe a video file for metadata (duration, resolution, codec).
 */
export async function probeVideo(req: Request, res: Response) {
  try {
    const { videoPath } = req.body;
    if (!videoPath || !fs.existsSync(videoPath)) {
      return res.status(400).json({ error: 'Valid videoPath is required' });
    }

    const info = await probeClip(videoPath);
    res.json({ videoPath, ...info });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to probe video', details: error.message });
  }
}

// ─── SCENE CLIP MANAGEMENT ──────────────────────────────────────

/**
 * POST /api/preview/scene/:sceneId/clips
 * Add a clip to a scene.
 */
export async function addSceneClip(req: Request, res: Response) {
  try {
    const sceneId = parseInt(req.params.sceneId);
    if (isNaN(sceneId)) return res.status(400).json({ error: 'Invalid scene ID' });

    const { clip_source, clip_type = 'generated', label, duration_seconds, metadata } = req.body;
    if (!clip_source) {
      return res.status(400).json({ error: 'clip_source is required' });
    }

    const result = await pool.query(
      `INSERT INTO scene_clips (scene_id, clip_source, clip_type, label, duration_seconds, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [sceneId, clip_source, clip_type, label || null, duration_seconds || null, metadata ? JSON.stringify(metadata) : '{}']
    );

    res.status(201).json({ clip: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add scene clip', details: error.message });
  }
}

/**
 * DELETE /api/preview/scene/clips/:clipId
 * Remove a clip from a scene.
 */
export async function removeSceneClip(req: Request, res: Response) {
  try {
    const clipId = parseInt(req.params.clipId);
    if (isNaN(clipId)) return res.status(400).json({ error: 'Invalid clip ID' });

    const result = await pool.query('DELETE FROM scene_clips WHERE id = $1 RETURNING *', [clipId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Scene clip not found' });
    }

    res.json({ message: 'Scene clip removed', clip: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to remove scene clip', details: error.message });
  }
}

/**
 * PUT /api/preview/scene/clips/:clipId
 * Update a scene clip.
 */
export async function updateSceneClip(req: Request, res: Response) {
  try {
    const clipId = parseInt(req.params.clipId);
    if (isNaN(clipId)) return res.status(400).json({ error: 'Invalid clip ID' });

    const { clip_source, clip_type, label, duration_seconds } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (clip_source !== undefined) { updates.push(`clip_source = $${i++}`); values.push(clip_source); }
    if (clip_type !== undefined) { updates.push(`clip_type = $${i++}`); values.push(clip_type); }
    if (label !== undefined) { updates.push(`label = $${i++}`); values.push(label); }
    if (duration_seconds !== undefined) { updates.push(`duration_seconds = $${i++}`); values.push(duration_seconds); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = NOW()');
    values.push(clipId);

    const result = await pool.query(
      `UPDATE scene_clips SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Scene clip not found' });
    }

    res.json({ clip: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update scene clip', details: error.message });
  }
}
