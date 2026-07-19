/**
 * userModel.ts - User Database Operations
 * MovieAnimation Backend - Phase 9 Auth Enhancement
 *
 * Extended with: email verification, password reset, refresh tokens,
 * OAuth account linking, and session management.
 */

import pool from '../config/database';

// ═══ Type Definitions ════════════════════════════════════════════════════════

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  verification_token: string | null;
  verification_token_expires: Date | null;
  reset_token: string | null;
  reset_token_expires: Date | null;
  refresh_token: string | null;
  refresh_token_expires: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserPublic {
  id: number;
  name: string;
  email: string;
  email_verified: boolean;
  created_at: Date;
  last_login_at: Date | null;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password_hash: string;
}

export interface OAuthAccount {
  id: number;
  user_id: number;
  provider: 'google' | 'github';
  provider_user_id: string;
  provider_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires: Date | null;
  created_at: Date;
}

// ═══ User Queries ════════════════════════════════════════════════════════════

/**
 * Find a user by email (includes auth-related fields)
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, name, email, password_hash, email_verified,
            verification_token, verification_token_expires,
            reset_token, reset_token_expires,
            refresh_token, refresh_token_expires,
            last_login_at, created_at, updated_at
     FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  return result.rows[0] || null;
}

/**
 * Find a user by ID (public fields only)
 */
export async function findUserById(id: number): Promise<UserPublic | null> {
  const result = await pool.query<UserPublic>(
    `SELECT id, name, email, email_verified, created_at, last_login_at
     FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Find a user by ID with full details (for internal use)
 */
export async function findUserByIdFull(id: number): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, name, email, password_hash, email_verified,
            verification_token, verification_token_expires,
            reset_token, reset_token_expires,
            refresh_token, refresh_token_expires,
            last_login_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Create a new user (returns public fields)
 */
export async function createUser(input: CreateUserInput): Promise<UserPublic> {
  const result = await pool.query<UserPublic>(
    `INSERT INTO users (name, email, password_hash) 
     VALUES ($1, $2, $3) 
     RETURNING id, name, email, email_verified, created_at, last_login_at`,
    [input.name, input.email.toLowerCase().trim(), input.password_hash]
  );
  return result.rows[0];
}

/**
 * Update user profile
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
     RETURNING id, name, email, email_verified, created_at, last_login_at`,
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

// ═══ Email Verification ═════════════════════════════════════════════════════

/**
 * Set verification token for a user
 */
export async function setVerificationToken(
  userId: number,
  token: string,
  expiresAt: Date
): Promise<void> {
  await pool.query(
    `UPDATE users 
     SET verification_token = $1, verification_token_expires = $2
     WHERE id = $3`,
    [token, expiresAt, userId]
  );
}

/**
 * Find user by verification token (only valid, non-expired tokens)
 */
export async function findUserByVerificationToken(token: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, name, email, password_hash, email_verified,
            verification_token, verification_token_expires,
            reset_token, reset_token_expires,
            refresh_token, refresh_token_expires,
            last_login_at, created_at, updated_at
     FROM users 
     WHERE verification_token = $1 
       AND verification_token_expires > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

/**
 * Mark user's email as verified and clear verification token
 */
export async function verifyUserEmail(userId: number): Promise<void> {
  await pool.query(
    `UPDATE users 
     SET email_verified = TRUE,
         verification_token = NULL,
         verification_token_expires = NULL
     WHERE id = $1`,
    [userId]
  );
}

// ═══ Password Reset ═════════════════════════════════════════════════════════

/**
 * Set password reset token for a user
 */
export async function setResetToken(
  userId: number,
  token: string,
  expiresAt: Date
): Promise<void> {
  await pool.query(
    `UPDATE users 
     SET reset_token = $1, reset_token_expires = $2
     WHERE id = $3`,
    [token, expiresAt, userId]
  );
}

/**
 * Find user by valid reset token
 */
export async function findUserByResetToken(token: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, name, email, password_hash, email_verified,
            verification_token, verification_token_expires,
            reset_token, reset_token_expires,
            refresh_token, refresh_token_expires,
            last_login_at, created_at, updated_at
     FROM users 
     WHERE reset_token = $1 
       AND reset_token_expires > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

/**
 * Reset password and clear reset token
 */
export async function resetPassword(
  userId: number,
  newPasswordHash: string
): Promise<void> {
  await pool.query(
    `UPDATE users 
     SET password_hash = $1,
         reset_token = NULL,
         reset_token_expires = NULL
     WHERE id = $2`,
    [newPasswordHash, userId]
  );
}

// ═══ Refresh Token Management ═══════════════════════════════════════════════

/**
 * Store refresh token for a user (for session management)
 */
export async function setRefreshToken(
  userId: number,
  token: string,
  expiresAt: Date
): Promise<void> {
  await pool.query(
    `UPDATE users 
     SET refresh_token = $1, refresh_token_expires = $2
     WHERE id = $3`,
    [token, expiresAt, userId]
  );
}

/**
 * Find user by valid refresh token
 */
export async function findUserByRefreshToken(token: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT id, name, email, password_hash, email_verified,
            verification_token, verification_token_expires,
            reset_token, reset_token_expires,
            refresh_token, refresh_token_expires,
            last_login_at, created_at, updated_at
     FROM users 
     WHERE refresh_token = $1 
       AND refresh_token_expires > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

/**
 * Invalidate refresh token (logout)
 */
export async function clearRefreshToken(userId: number): Promise<void> {
  await pool.query(
    `UPDATE users 
     SET refresh_token = NULL, refresh_token_expires = NULL
     WHERE id = $1`,
    [userId]
  );
}

/**
 * Record last login timestamp
 */
export async function recordLogin(userId: number): Promise<void> {
  await pool.query(
    `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
    [userId]
  );
}

// ═══ Password Management ════════════════════════════════════════════════════

/**
 * Update password directly (for password change while logged in)
 */
export async function updatePassword(
  userId: number,
  newPasswordHash: string
): Promise<void> {
  await pool.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2`,
    [newPasswordHash, userId]
  );
}

// ═══ OAuth Account Operations ═══════════════════════════════════════════════

/**
 * Link an OAuth account to a user
 */
export async function linkOAuthAccount(params: {
  userId: number;
  provider: 'google' | 'github';
  providerUserId: string;
  providerEmail?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpires?: Date;
}): Promise<OAuthAccount> {
  const result = await pool.query<OAuthAccount>(
    `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_email, access_token, refresh_token, token_expires)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (provider, provider_user_id) 
     DO UPDATE SET access_token = $5, refresh_token = $6, token_expires = $7, updated_at = NOW()
     RETURNING *`,
    [
      params.userId, params.provider, params.providerUserId,
      params.providerEmail || null, params.accessToken || null,
      params.refreshToken || null, params.tokenExpires || null,
    ]
  );
  return result.rows[0];
}

/**
 * Find OAuth account by provider and provider user ID
 */
export async function findOAuthAccount(
  provider: 'google' | 'github',
  providerUserId: string
): Promise<OAuthAccount | null> {
  const result = await pool.query<OAuthAccount>(
    `SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2`,
    [provider, providerUserId]
  );
  return result.rows[0] || null;
}

/**
 * Get all OAuth accounts for a user
 */
export async function getUserOAuthAccounts(userId: number): Promise<OAuthAccount[]> {
  const result = await pool.query<OAuthAccount>(
    `SELECT id, user_id, provider, provider_email, created_at 
     FROM oauth_accounts WHERE user_id = $1`,
    [userId]
  );
  return result.rows;
}

/**
 * Unlink an OAuth account
 */
export async function unlinkOAuthAccount(
  userId: number,
  provider: 'google' | 'github'
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM oauth_accounts WHERE user_id = $1 AND provider = $2`,
    [userId, provider]
  );
  return (result.rowCount ?? 0) > 0;
}

// ═══ Dashboard Stats ════════════════════════════════════════════════════════

/**
 * Get user dashboard stats
 */
export async function getUserStats(userId: number): Promise<{
  projectsCreated: number;
  animationsGenerated: number;
  totalStorageBytes: number;
}> {
  const animResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM animations 
     WHERE script_id IN (SELECT id FROM scripts WHERE author = 
       (SELECT name FROM users WHERE id = $1))`,
    [userId]
  );

  const scriptResult = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM scripts WHERE author = (SELECT name FROM users WHERE id = $1)',
    [userId]
  );

  return {
    projectsCreated: parseInt(scriptResult.rows[0]?.count || '0', 10),
    animationsGenerated: parseInt(animResult.rows[0]?.count || '0', 10),
    totalStorageBytes: 0,
  };
}
