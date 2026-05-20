/**
 * assetModel.ts - User Asset Database Operations
 * MovieAnimation Backend - Phase 3 Script & Asset Management
 */

import pool from '../config/database';

export interface UserAsset {
  id: number;
  user_id: number;
  animation_id: number | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  asset_type: string;
  character_id: number | null;
  metadata: Record<string, any>;
  created_at: Date;
  last_modified: Date;
}

export interface CreateAssetInput {
  user_id: number;
  animation_id?: number;
  file_name: string;
  file_path: string;
  file_size?: number;
  mime_type?: string;
  asset_type?: string;
  character_id?: number;
  metadata?: Record<string, any>;
}

/**
 * Create an asset record
 */
export async function createAsset(input: CreateAssetInput): Promise<UserAsset> {
  const result = await pool.query<UserAsset>(
    `INSERT INTO user_assets (user_id, animation_id, file_name, file_path, file_size, mime_type, asset_type, character_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.user_id,
      input.animation_id || null,
      input.file_name,
      input.file_path,
      input.file_size || null,
      input.mime_type || null,
      input.asset_type || 'character_photo',
      input.character_id || null,
      JSON.stringify(input.metadata || {}),
    ]
  );
  return result.rows[0];
}

/**
 * Get assets for a user
 */
export async function getUserAssets(
  userId: number,
  options?: {
    asset_type?: string;
    animation_id?: number;
    character_id?: number;
    limit?: number;
    offset?: number;
  }
): Promise<UserAsset[]> {
  let query = 'SELECT * FROM user_assets WHERE user_id = $1';
  const params: any[] = [userId];
  let paramIndex = 2;

  if (options?.asset_type) {
    query += ` AND asset_type = $${paramIndex++}`;
    params.push(options.asset_type);
  }
  if (options?.animation_id) {
    query += ` AND animation_id = $${paramIndex++}`;
    params.push(options.animation_id);
  }
  if (options?.character_id) {
    query += ` AND character_id = $${paramIndex++}`;
    params.push(options.character_id);
  }

  query += ' ORDER BY created_at DESC';

  if (options?.limit) {
    query += ` LIMIT $${paramIndex++}`;
    params.push(options.limit);
  }
  if (options?.offset) {
    query += ` OFFSET $${paramIndex++}`;
    params.push(options.offset);
  }

  const result = await pool.query<UserAsset>(query, params);
  return result.rows;
}

/**
 * Get a single asset by ID
 */
export async function getAssetById(id: number): Promise<UserAsset | null> {
  const result = await pool.query<UserAsset>(
    'SELECT * FROM user_assets WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update asset metadata or character assignment
 */
export async function updateAsset(
  id: number,
  updates: {
    asset_type?: string;
    character_id?: number | null;
    animation_id?: number | null;
    metadata?: Record<string, any>;
    file_name?: string;
  }
): Promise<UserAsset | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.asset_type !== undefined) {
    setClauses.push(`asset_type = $${paramIndex++}`);
    values.push(updates.asset_type);
  }
  if (updates.character_id !== undefined) {
    setClauses.push(`character_id = $${paramIndex++}`);
    values.push(updates.character_id);
  }
  if (updates.animation_id !== undefined) {
    setClauses.push(`animation_id = $${paramIndex++}`);
    values.push(updates.animation_id);
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIndex++}`);
    values.push(JSON.stringify(updates.metadata));
  }
  if (updates.file_name !== undefined) {
    setClauses.push(`file_name = $${paramIndex++}`);
    values.push(updates.file_name);
  }

  if (setClauses.length === 0) return null;

  values.push(id);
  const result = await pool.query<UserAsset>(
    `UPDATE user_assets SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete an asset
 */
export async function deleteAsset(id: number): Promise<UserAsset | null> {
  const result = await pool.query<UserAsset>(
    'DELETE FROM user_assets WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Get asset stats for a user
 */
export async function getAssetStats(userId: number): Promise<{
  totalAssets: number;
  totalSize: number;
  characterPhotos: number;
  props: number;
  backgrounds: number;
}> {
  const result = await pool.query<{
    total_assets: string;
    total_size: string;
    character_photos: string;
    props: string;
    backgrounds: string;
  }>(
    `SELECT 
       COUNT(*) as total_assets,
       COALESCE(SUM(file_size), 0) as total_size,
       COUNT(*) FILTER (WHERE asset_type = 'character_photo') as character_photos,
       COUNT(*) FILTER (WHERE asset_type = 'prop') as props,
       COUNT(*) FILTER (WHERE asset_type = 'background') as backgrounds
     FROM user_assets WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return {
    totalAssets: parseInt(row.total_assets, 10),
    totalSize: parseInt(row.total_size, 10),
    characterPhotos: parseInt(row.character_photos, 10),
    props: parseInt(row.props, 10),
    backgrounds: parseInt(row.backgrounds, 10),
  };
}
