/**
 * timelineModel.ts - Timeline Database Operations
 * Phase 7: Video Assembly
 */

import pool from '../config/database';

export interface Timeline {
  id: number;
  project_id: number;
  animation_id: number | null;
  name: string;
  status: 'draft' | 'assembling' | 'completed' | 'failed';
  total_duration_seconds: number;
  output_path: string | null;
  output_size_bytes: number | null;
  output_resolution: string;
  assembly_started_at: string | null;
  assembly_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineClip {
  id: number;
  timeline_id: number;
  scene_id: number | null;
  clip_source: string | null;
  clip_order: number;
  label: string | null;
  duration_seconds: number | null;
  trim_start_seconds: number;
  trim_end_seconds: number | null;
  volume: number;
  transition_type: 'cut' | 'fade' | 'dissolve' | 'wipe';
  transition_duration_ms: number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface TimelineWithClips extends Timeline {
  clips: TimelineClip[];
}

export interface CreateTimelineInput {
  project_id: number;
  animation_id?: number;
  name?: string;
  output_resolution?: string;
}

export interface CreateClipInput {
  scene_id?: number;
  clip_source?: string;
  clip_order: number;
  label?: string;
  duration_seconds?: number;
  trim_start_seconds?: number;
  trim_end_seconds?: number;
  volume?: number;
  transition_type?: string;
  transition_duration_ms?: number;
}

export interface UpdateClipInput {
  clip_order?: number;
  label?: string;
  trim_start_seconds?: number;
  trim_end_seconds?: number;
  volume?: number;
  transition_type?: string;
  transition_duration_ms?: number;
  status?: string;
}

// ─── Timeline CRUD ──────────────────────────────────────────────

export async function createTimeline(input: CreateTimelineInput): Promise<Timeline> {
  const result = await pool.query<Timeline>(
    `INSERT INTO timelines (project_id, animation_id, name, output_resolution)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      input.project_id,
      input.animation_id || null,
      input.name || 'Unnamed Timeline',
      input.output_resolution || '1080p',
    ]
  );
  return result.rows[0];
}

export async function getTimelinesByProject(projectId: number): Promise<Timeline[]> {
  const result = await pool.query<Timeline>(
    'SELECT * FROM timelines WHERE project_id = $1 ORDER BY created_at DESC',
    [projectId]
  );
  return result.rows;
}

export async function getTimelineById(id: number): Promise<Timeline | null> {
  const result = await pool.query<Timeline>(
    'SELECT * FROM timelines WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getTimelineWithClips(id: number): Promise<TimelineWithClips | null> {
  const timeline = await getTimelineById(id);
  if (!timeline) return null;

  const clips = await getTimelineClips(id);
  return { ...timeline, clips };
}

export async function updateTimeline(
  id: number,
  updates: {
    name?: string;
    status?: string;
    output_path?: string;
    output_size_bytes?: number;
    output_resolution?: string;
    total_duration_seconds?: number;
    assembly_started_at?: string;
    assembly_completed_at?: string;
  }
): Promise<Timeline | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(value);
    }
  }

  if (fields.length === 0) return null;

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query<Timeline>(
    `UPDATE timelines SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function deleteTimeline(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM timelines WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

// ─── Timeline Clips CRUD ────────────────────────────────────────

export async function addClipToTimeline(
  timelineId: number,
  input: CreateClipInput
): Promise<TimelineClip> {
  const result = await pool.query<TimelineClip>(
    `INSERT INTO timeline_clips
     (timeline_id, scene_id, clip_source, clip_order, label, duration_seconds, 
      trim_start_seconds, trim_end_seconds, volume, transition_type, transition_duration_ms, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ready')
     RETURNING *`,
    [
      timelineId,
      input.scene_id || null,
      input.clip_source || null,
      input.clip_order,
      input.label || null,
      input.duration_seconds || null,
      input.trim_start_seconds || 0,
      input.trim_end_seconds || null,
      input.volume ?? 1.0,
      input.transition_type || 'cut',
      input.transition_duration_ms || 0,
    ]
  );
  return result.rows[0];
}

export async function getTimelineClips(timelineId: number): Promise<TimelineClip[]> {
  const result = await pool.query<TimelineClip>(
    'SELECT * FROM timeline_clips WHERE timeline_id = $1 ORDER BY clip_order ASC',
    [timelineId]
  );
  return result.rows;
}

export async function getTimelineClip(id: number): Promise<TimelineClip | null> {
  const result = await pool.query<TimelineClip>(
    'SELECT * FROM timeline_clips WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function updateClip(
  id: number,
  input: UpdateClipInput
): Promise<TimelineClip | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(value);
    }
  }

  if (fields.length === 0) return null;

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query<TimelineClip>(
    `UPDATE timeline_clips SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function removeClip(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM timeline_clips WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function removeAllClips(timelineId: number): Promise<number> {
  const result = await pool.query(
    'DELETE FROM timeline_clips WHERE timeline_id = $1',
    [timelineId]
  );
  return result.rowCount ?? 0;
}

/**
 * Bulk reorder: set clip_order for all clips in a timeline.
 * Input: array of { id, clip_order }
 */
export async function reorderClips(
  timelineId: number,
  orderUpdates: Array<{ id: number; clip_order: number }>
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const update of orderUpdates) {
      await client.query(
        'UPDATE timeline_clips SET clip_order = $1, updated_at = NOW() WHERE id = $2 AND timeline_id = $3',
        [update.clip_order, update.id, timelineId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Bulk insert clips (replaces existing clips for a timeline)
 */
export async function bulkSetClips(
  timelineId: number,
  clips: CreateClipInput[]
): Promise<TimelineClip[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Remove existing clips
    await client.query('DELETE FROM timeline_clips WHERE timeline_id = $1', [timelineId]);
    
    // Insert new clips
    const results: TimelineClip[] = [];
    for (const clip of clips) {
      const result = await client.query<TimelineClip>(
        `INSERT INTO timeline_clips
         (timeline_id, scene_id, clip_source, clip_order, label, duration_seconds,
          trim_start_seconds, trim_end_seconds, volume, transition_type, transition_duration_ms, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ready')
         RETURNING *`,
        [
          timelineId,
          clip.scene_id || null,
          clip.clip_source || null,
          clip.clip_order,
          clip.label || null,
          clip.duration_seconds || null,
          clip.trim_start_seconds || 0,
          clip.trim_end_seconds || null,
          clip.volume ?? 1.0,
          clip.transition_type || 'cut',
          clip.transition_duration_ms || 0,
        ]
      );
      results.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
