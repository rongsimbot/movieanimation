/**
 * timelineController.ts - Timeline API Controller
 * Phase 7: Video Assembly
 */

import { Request, Response } from 'express';
import * as timelineModel from '../models/timelineModel';
import {
  assembleVideo,
  probeDuration,
} from '../services/videoAssembly';
import type { TimelineClip, Transition } from '../services/videoAssembly';
import { addAssemblyJob } from '../queue/assemblyQueue';
import { progressService } from '../services/progressService';
import path from 'path';
import fs from 'fs';

const OUTPUT_DIR = process.env.VIDEO_OUTPUT_DIR || path.join(__dirname, '../../output');
const ASSETS_DIR = process.env.VIDEO_ASSETS_DIR || path.join(__dirname, '../../assets/generated');

// ─── TIMELINE CRUD ──────────────────────────────────────────────

/** Create a new timeline for a project */
export async function createTimeline(req: Request, res: Response) {
  try {
    const { project_id, animation_id, name, output_resolution } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const timeline = await timelineModel.createTimeline({
      project_id,
      animation_id,
      name,
      output_resolution,
    });

    res.status(201).json({ timeline });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create timeline', details: error.message });
  }
}

/** Get all timelines for a project */
export async function getTimelines(req: Request, res: Response) {
  try {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    const timelines = await timelineModel.getTimelinesByProject(projectId);
    res.json({ timelines });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch timelines', details: error.message });
  }
}

/** Get a timeline with all its clips */
export async function getTimeline(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid timeline ID' });

    const timeline = await timelineModel.getTimelineWithClips(id);
    if (!timeline) {
      return res.status(404).json({ error: 'Timeline not found' });
    }

    res.json({ timeline });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch timeline', details: error.message });
  }
}

/** Delete a timeline */
export async function deleteTimeline(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid timeline ID' });

    const deleted = await timelineModel.deleteTimeline(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Timeline not found' });
    }

    res.json({ message: 'Timeline deleted' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete timeline', details: error.message });
  }
}

// ─── CLIP MANAGEMENT ────────────────────────────────────────────

/** Add a clip to a timeline */
export async function addClip(req: Request, res: Response) {
  try {
    const timelineId = parseInt(req.params.id);
    if (isNaN(timelineId)) return res.status(400).json({ error: 'Invalid timeline ID' });

    const clip = await timelineModel.addClipToTimeline(timelineId, req.body);
    res.status(201).json({ clip });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to add clip', details: error.message });
  }
}

/** Update a clip's properties */
export async function updateClip(req: Request, res: Response) {
  try {
    const clipId = parseInt(req.params.clipId);
    if (isNaN(clipId)) return res.status(400).json({ error: 'Invalid clip ID' });

    const clip = await timelineModel.updateClip(clipId, req.body);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    res.json({ clip });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update clip', details: error.message });
  }
}

/** Remove a clip from a timeline */
export async function removeClip(req: Request, res: Response) {
  try {
    const clipId = parseInt(req.params.clipId);
    if (isNaN(clipId)) return res.status(400).json({ error: 'Invalid clip ID' });

    const removed = await timelineModel.removeClip(clipId);
    if (!removed) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    res.json({ message: 'Clip removed' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to remove clip', details: error.message });
  }
}

/** Reorder clips in a timeline */
export async function reorderClips(req: Request, res: Response) {
  try {
    const timelineId = parseInt(req.params.id);
    if (isNaN(timelineId)) return res.status(400).json({ error: 'Invalid timeline ID' });

    const { order } = req.body;
    if (!order || !Array.isArray(order)) {
      return res.status(400).json({ error: 'order array is required: [{ id, clip_order }]' });
    }

    await timelineModel.reorderClips(timelineId, order);
    const clips = await timelineModel.getTimelineClips(timelineId);
    res.json({ clips });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to reorder clips', details: error.message });
  }
}

/** Bulk set clips for a timeline (replaces all existing clips) */
export async function bulkSetClips(req: Request, res: Response) {
  try {
    const timelineId = parseInt(req.params.id);
    if (isNaN(timelineId)) return res.status(400).json({ error: 'Invalid timeline ID' });

    const { clips } = req.body;
    if (!clips || !Array.isArray(clips)) {
      return res.status(400).json({ error: 'clips array is required' });
    }

    const result = await timelineModel.bulkSetClips(timelineId, clips);
    res.json({ clips: result });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to set clips', details: error.message });
  }
}

// ─── ASSEMBLY ───────────────────────────────────────────────────

/** Start video assembly for a timeline */
export async function startAssembly(req: Request, res: Response) {
  try {
    const timelineId = parseInt(req.params.id);
    if (isNaN(timelineId)) return res.status(400).json({ error: 'Invalid timeline ID' });

    const timeline = await timelineModel.getTimelineWithClips(timelineId);
    if (!timeline) {
      return res.status(404).json({ error: 'Timeline not found' });
    }

    if (!timeline.clips || timeline.clips.length === 0) {
      return res.status(400).json({ error: 'Timeline has no clips — add clips before assembling' });
    }

    // Validate clips have sources
    const missingSources = timeline.clips.filter(c => !c.clip_source);
    if (missingSources.length > 0) {
      return res.status(400).json({
        error: `${missingSources.length} clip(s) have no video source`,
        clipIds: missingSources.map(c => c.id),
      });
    }

    // Build assembly options
    const clips: TimelineClip[] = timeline.clips
      .sort((a, b) => a.clip_order - b.clip_order)
      .map(c => ({
        videoPath: c.clip_source!,
        label: c.label || `Clip ${c.clip_order}`,
        duration: c.duration_seconds || undefined,
        trimStart: c.trim_start_seconds || 0,
        trimEnd: c.trim_end_seconds || undefined,
        volume: c.volume,
      }));

    const transitions: Transition[] = [];
    for (let i = 1; i < timeline.clips.length; i++) {
      const prev = timeline.clips[i - 1];
      transitions.push({
        type: prev.transition_type as any || 'cut',
        durationMs: prev.transition_duration_ms || 0,
      });
    }

    // Generate output filename
    const outputFilename = `movie_${timeline.project_id}_${timelineId}_${Date.now()}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    // Mark timeline as assembling
    await timelineModel.updateTimeline(timelineId, {
      status: 'assembling',
      assembly_started_at: new Date().toISOString(),
    });

    // Get user ID from auth context
    const userId = (req as any).user?.id || 'anonymous';

    // Queue assembly job
    const job = await addAssemblyJob(
      String(userId),
      { clips, transitions, outputPath, resolution: timeline.output_resolution as any },
    );

    // Store assembly log
    await pool.query(
      `INSERT INTO assembly_logs (timeline_id, user_id, job_id, status, ffmpeg_command)
       VALUES ($1, $2, $3, 'queued', $4)`,
      [timelineId, userId, job.id, 'assembly job queued via BullMQ']
    );

    res.json({
      jobId: job.id,
      timelineId,
      status: 'assembling',
      outputPath,
      clipCount: clips.length,
      estimatedDuration: timeline.clips.reduce((sum, c) => sum + (c.duration_seconds || 5), 0),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to start assembly', details: error.message });
  }
}

/** Get assembly status */
export async function getAssemblyStatus(req: Request, res: Response) {
  try {
    const timelineId = parseInt(req.params.id);
    if (isNaN(timelineId)) return res.status(400).json({ error: 'Invalid timeline ID' });

    const timeline = await timelineModel.getTimelineById(timelineId);
    if (!timeline) return res.status(404).json({ error: 'Timeline not found' });

    // Check assembly logs for latest job
    const logResult = await pool.query(
      'SELECT * FROM assembly_logs WHERE timeline_id = $1 ORDER BY created_at DESC LIMIT 1',
      [timelineId]
    );

    res.json({
      timelineId,
      timelineStatus: timeline.status,
      latestLog: logResult.rows[0] || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get assembly status', details: error.message });
  }
}

// Need pool for assembly logs
import pool from '../config/database';
