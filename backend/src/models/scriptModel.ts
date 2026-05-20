/**
 * scriptModel.ts - Script Database Operations
 * MovieAnimation Backend - Phase 3 Script & Asset Management
 */

import pool from '../config/database';

export interface Script {
  id: number;
  script_title: string;
  script_content: string;
  version: string;
  version_notes: string | null;
  author: string | null;
  genre: string | null;
  word_count: number | null;
  status: 'draft' | 'review' | 'approved' | 'archived';
  created_at: Date;
  last_modified: Date;
  animation_id: number | null;
  original_text: string | null;
  source_filename: string | null;
  uploaded_at: Date | null;
}

export interface CreateScriptInput {
  script_title: string;
  script_content: string;
  author?: string;
  genre?: string;
  source_filename?: string;
}

export interface UpdateScriptInput {
  script_title?: string;
  script_content?: string;
  genre?: string;
  status?: 'draft' | 'review' | 'approved' | 'archived';
  version_notes?: string;
}

/**
 * Create a new script
 */
export async function createScript(input: CreateScriptInput): Promise<Script> {
  const wordCount = input.script_content.split(/\s+/).filter(Boolean).length;
  const result = await pool.query<Script>(
    `INSERT INTO scripts (script_title, script_content, author, genre, word_count, source_filename, original_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.script_title,
      input.script_content,
      input.author || null,
      input.genre || null,
      wordCount,
      input.source_filename || null,
      input.script_content, // original_text same as initial content
    ]
  );
  return result.rows[0];
}

/**
 * Get all scripts (with optional filters)
 */
export async function getAllScripts(filters?: {
  author?: string;
  status?: string;
  genre?: string;
  limit?: number;
  offset?: number;
}): Promise<Script[]> {
  let query = 'SELECT * FROM scripts WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (filters?.author) {
    query += ` AND author ILIKE $${paramIndex++}`;
    params.push(`%${filters.author}%`);
  }
  if (filters?.status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(filters.status);
  }
  if (filters?.genre) {
    query += ` AND genre = $${paramIndex++}`;
    params.push(filters.genre);
  }

  query += ' ORDER BY last_modified DESC';

  if (filters?.limit) {
    query += ` LIMIT $${paramIndex++}`;
    params.push(filters.limit);
  }
  if (filters?.offset) {
    query += ` OFFSET $${paramIndex++}`;
    params.push(filters.offset);
  }

  const result = await pool.query<Script>(query, params);
  return result.rows;
}

/**
 * Get a script by ID
 */
export async function getScriptById(id: number): Promise<Script | null> {
  const result = await pool.query<Script>(
    'SELECT * FROM scripts WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update a script
 */
export async function updateScript(
  id: number,
  input: UpdateScriptInput
): Promise<Script | null> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (input.script_title !== undefined) {
    updates.push(`script_title = $${paramIndex++}`);
    values.push(input.script_title);
  }
  if (input.script_content !== undefined) {
    updates.push(`script_content = $${paramIndex++}`);
    values.push(input.script_content);
    // Update word count
    const wordCount = input.script_content.split(/\s+/).filter(Boolean).length;
    updates.push(`word_count = $${paramIndex++}`);
    values.push(wordCount);
  }
  if (input.genre !== undefined) {
    updates.push(`genre = $${paramIndex++}`);
    values.push(input.genre);
  }
  if (input.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(input.status);
  }
  if (input.version_notes !== undefined) {
    updates.push(`version_notes = $${paramIndex++}`);
    values.push(input.version_notes);
  }

  if (updates.length === 0) return null;

  values.push(id);
  const result = await pool.query<Script>(
    `UPDATE scripts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete a script
 */
export async function deleteScript(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM scripts WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get total script count
 */
export async function getScriptCount(filters?: {
  author?: string;
  status?: string;
}): Promise<number> {
  let query = 'SELECT COUNT(*) as count FROM scripts WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (filters?.author) {
    query += ` AND author ILIKE $${paramIndex++}`;
    params.push(`%${filters.author}%`);
  }
  if (filters?.status) {
    query += ` AND status = $${paramIndex++}`;
    params.push(filters.status);
  }

  const result = await pool.query<{ count: string }>(query, params);
  return parseInt(result.rows[0].count, 10);
}
