/**
 * userModel.ts - User Database Operations
 * MovieAnimation Backend - Phase 2 Auth
 */

import pool from '../config/database';

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface UserPublic {
  id: number;
  name: string;
  email: string;
  created_at: Date;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password_hash: string;
}

/**
 * Find a user by email
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    'SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  return result.rows[0] || null;
}

/**
 * Find a user by ID (public fields only)
 */
export async function findUserById(id: number): Promise<UserPublic | null> {
  const result = await pool.query<UserPublic>(
    'SELECT id, name, email, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Create a new user
 * Returns the created user (public fields)
 */
export async function createUser(input: CreateUserInput): Promise<UserPublic> {
  const result = await pool.query<UserPublic>(
    `INSERT INTO users (name, email, password_hash) 
     VALUES ($1, $2, $3) 
     RETURNING id, name, email, created_at`,
    [input.name, input.email.toLowerCase().trim(), input.password_hash]
  );
  return result.rows[0];
}

/**
 * Update user profile (name, email optionally)
 */
export async function updateUser(
  id: number,
  updates: { name?: string; email?: string }
): Promise<UserPublic | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }
  if (updates.email !== undefined) {
    setClauses.push(`email = $${paramIndex++}`);
    values.push(updates.email.toLowerCase().trim());
  }

  if (setClauses.length === 0) return null;

  values.push(id);
  const result = await pool.query<UserPublic>(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} 
     RETURNING id, name, email, created_at`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete a user account
 */
export async function deleteUser(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get user dashboard stats (mock for now, will be real later)
 */
export async function getUserStats(userId: number): Promise<{
  projectsCreated: number;
  animationsGenerated: number;
  totalStorageBytes: number;
}> {
  // Count animations belonging to this user
  const animResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM animations 
     WHERE script_id IN (SELECT id FROM scripts WHERE author = 
       (SELECT name FROM users WHERE id = $1))`,
    [userId]
  );

  // Count scripts
  const scriptResult = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM scripts WHERE author = (SELECT name FROM users WHERE id = $1)',
    [userId]
  );

  return {
    projectsCreated: parseInt(scriptResult.rows[0]?.count || '0', 10),
    animationsGenerated: parseInt(animResult.rows[0]?.count || '0', 10),
    totalStorageBytes: 0, // To be implemented
  };
}
