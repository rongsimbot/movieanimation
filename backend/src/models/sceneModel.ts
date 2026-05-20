/**
 * sceneModel.ts - Scene Database Operations
 * MovieAnimation Backend - Phase 3 Script & Asset Management
 */

import pool from '../config/database';

export interface Scene {
  id: number;
  chapter_id: number;
  scene_number: number;
  scene_title: string | null;
  description: string | null;
  duration_seconds: number | null;
  location: string | null;
  created_at: Date;
  last_modified: Date;
}

export interface CreateSceneInput {
  chapter_id: number;
  scene_number: number;
  scene_title?: string;
  description?: string;
  duration_seconds?: number;
  location?: string;
}

export interface UpdateSceneInput {
  scene_title?: string;
  description?: string;
  duration_seconds?: number;
  location?: string;
}

/**
 * Create a new scene
 */
export async function createScene(input: CreateSceneInput): Promise<Scene> {
  const result = await pool.query<Scene>(
    `INSERT INTO scenes (chapter_id, scene_number, scene_title, description, duration_seconds, location)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.chapter_id,
      input.scene_number,
      input.scene_title || null,
      input.description || null,
      input.duration_seconds || null,
      input.location || null,
    ]
  );
  return result.rows[0];
}

/**
 * Get scenes for a chapter
 */
export async function getScenesByChapter(chapterId: number): Promise<Scene[]> {
  const result = await pool.query<Scene>(
    'SELECT * FROM scenes WHERE chapter_id = $1 ORDER BY scene_number',
    [chapterId]
  );
  return result.rows;
}

/**
 * Get a single scene by ID
 */
export async function getSceneById(id: number): Promise<Scene | null> {
  const result = await pool.query<Scene>(
    'SELECT * FROM scenes WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update a scene
 */
export async function updateScene(
  id: number,
  input: UpdateSceneInput
): Promise<Scene | null> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (input.scene_title !== undefined) {
    updates.push(`scene_title = $${paramIndex++}`);
    values.push(input.scene_title);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }
  if (input.duration_seconds !== undefined) {
    updates.push(`duration_seconds = $${paramIndex++}`);
    values.push(input.duration_seconds);
  }
  if (input.location !== undefined) {
    updates.push(`location = $${paramIndex++}`);
    values.push(input.location);
  }

  if (updates.length === 0) return null;

  values.push(id);
  const result = await pool.query<Scene>(
    `UPDATE scenes SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete a scene
 */
export async function deleteScene(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM scenes WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get characters for a scene
 */
export async function getSceneCharacters(sceneId: number): Promise<any[]> {
  const result = await pool.query(
    `SELECT c.*, sc.action_notes
     FROM characters c
     JOIN scene_characters sc ON c.id = sc.character_id
     WHERE sc.scene_id = $1
     ORDER BY c.character_name`,
    [sceneId]
  );
  return result.rows;
}

/**
 * Bulk create scenes for a chapter (for AI parsing)
 */
export async function bulkCreateScenes(
  chapterId: number,
  scenes: Omit<CreateSceneInput, 'chapter_id'>[]
): Promise<Scene[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results: Scene[] = [];
    for (const scene of scenes) {
      const result = await client.query<Scene>(
        `INSERT INTO scenes (chapter_id, scene_number, scene_title, description, duration_seconds, location)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [chapterId, scene.scene_number, scene.scene_title, scene.description, scene.duration_seconds, scene.location]
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
