/**
 * characterModel.ts - Character Database Operations
 * MovieAnimation Backend - Phase 3 Script & Asset Management
 */

import pool from '../config/database';

export interface Character {
  id: number;
  character_name: string;
  character_type: string | null;
  description: string | null;
  appearance_notes: string | null;
  voice_notes: string | null;
  image_url: string | null;
  default_prompt: string | null;
  created_at: Date;
  last_modified: Date;
}

export interface CreateCharacterInput {
  character_name: string;
  character_type?: string;
  description?: string;
  appearance_notes?: string;
  voice_notes?: string;
  image_url?: string;
  default_prompt?: string;
}

export interface UpdateCharacterInput {
  character_name?: string;
  character_type?: string;
  description?: string;
  appearance_notes?: string;
  voice_notes?: string;
  image_url?: string;
  default_prompt?: string;
}

/**
 * Create a new character
 */
export async function createCharacter(input: CreateCharacterInput): Promise<Character> {
  const result = await pool.query<Character>(
    `INSERT INTO characters (character_name, character_type, description, appearance_notes, voice_notes, image_url, default_prompt)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.character_name,
      input.character_type || null,
      input.description || null,
      input.appearance_notes || null,
      input.voice_notes || null,
      input.image_url || null,
      input.default_prompt || null,
    ]
  );
  return result.rows[0];
}

/**
 * Get all characters with optional search
 */
export async function getAllCharacters(search?: string): Promise<Character[]> {
  if (search) {
    const result = await pool.query<Character>(
      `SELECT * FROM characters 
       WHERE character_name ILIKE $1 OR description ILIKE $1
       ORDER BY character_name`,
      [`%${search}%`]
    );
    return result.rows;
  }
  const result = await pool.query<Character>(
    'SELECT * FROM characters ORDER BY character_name'
  );
  return result.rows;
}

/**
 * Get a character by ID
 */
export async function getCharacterById(id: number): Promise<Character | null> {
  const result = await pool.query<Character>(
    'SELECT * FROM characters WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update a character
 */
export async function updateCharacter(
  id: number,
  input: UpdateCharacterInput
): Promise<Character | null> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  const fields: (keyof UpdateCharacterInput)[] = [
    'character_name', 'character_type', 'description',
    'appearance_notes', 'voice_notes', 'image_url', 'default_prompt',
  ];

  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = $${paramIndex++}`);
      values.push(input[field]);
    }
  }

  if (updates.length === 0) return null;

  values.push(id);
  const result = await pool.query<Character>(
    `UPDATE characters SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete a character
 */
export async function deleteCharacter(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM characters WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Link a character to a scene
 */
export async function linkCharacterToScene(
  sceneId: number,
  characterId: number,
  actionNotes?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO scene_characters (scene_id, character_id, action_notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (scene_id, character_id) DO UPDATE SET action_notes = $3`,
    [sceneId, characterId, actionNotes || null]
  );
}

/**
 * Unlink a character from a scene
 */
export async function unlinkCharacterFromScene(
  sceneId: number,
  characterId: number
): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM scene_characters WHERE scene_id = $1 AND character_id = $2',
    [sceneId, characterId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Link a character to an animation
 */
export async function linkCharacterToAnimation(
  animationId: number,
  characterId: number,
  role?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO animation_characters (animation_id, character_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (animation_id, character_id) DO UPDATE SET role = $3`,
    [animationId, characterId, role || null]
  );
}
