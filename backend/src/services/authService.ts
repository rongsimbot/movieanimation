/**
 * authService.ts - Enhanced Authentication Business Logic
 * MovieAnimation Backend - Phase 9: User Authentication
 *
 * Features:
 *   - Registration with optional email verification
 *   - Login with refresh token rotation
 *   - Logout (token invalidation)
 *   - Token refresh
 *   - Email verification flow
 *   - Password reset flow
 *   - Password change (authenticated)
 *   - OAuth (Google/GitHub) integration
 *   - Session management via refresh tokens
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  findUserByEmail,
  findUserById,
  findUserByIdFull,
  createUser,
  updateUser,
  deleteUser,
  setVerificationToken,
  findUserByVerificationToken,
  verifyUserEmail,
  setResetToken,
  findUserByResetToken,
  resetPassword as resetPasswordInDb,
  setRefreshToken,
  findUserByRefreshToken,
  clearRefreshToken,
  recordLogin,
  updatePassword,
  linkOAuthAccount,
  findOAuthAccount,
  getUserOAuthAccounts,
  unlinkOAuthAccount,
  User,
  UserPublic,
} from '../models/userModel';
import { AppError } from '../middleware/errorHandler';

export { AppError };

// ═══ Configuration ═══════════════════════════════════════════════════════════

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const ACCESS_TOKEN_EXPIRES = '15m';   // Short-lived access token
const REFRESH_TOKEN_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const VERIFICATION_TOKEN_EXPIRES_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TOKEN_EXPIRES_MS = 60 * 60 * 1000;             // 1 hour
const BCRYPT_ROUNDS = 12;

// ═══ Interfaces ═════════════════════════════════════════════════════════════

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;       // seconds
}

export interface RegisterResult {
  user: UserPublic;
  tokens: AuthTokens;
}

export interface LoginResult {
  user: UserPublic;
  tokens: AuthTokens;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface JwtAccessPayload {
  sub: number;       // user ID
  email: string;
  name: string;
  type: 'access';
}

interface JwtRefreshPayload {
  sub: number;       // user ID
  jti: string;       // token ID (for revocation)
  type: 'refresh';
}

// ═══ Helper Functions ═══════════════════════════════════════════════════════

/**
 * Strip sensitive fields from a User object for public display
 */
function toPublicUser(user: User): UserPublic {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    email_verified: user.email_verified,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
  };
}

/**
 * Generate a cryptographically secure random token
 */
function generateToken(bytes: number = 48): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(password, salt);
}

// ═══ Token Generation ═══════════════════════════════════════════════════════

/**
 * Generate both access and refresh tokens
 */
function generateAccessToken(user: UserPublic): string {
  const payload: JwtAccessPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    type: 'access',
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES } as jwt.SignOptions);
}

async function generateRefreshToken(userId: number): Promise<string> {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { sub: userId, jti, type: 'refresh' } as JwtRefreshPayload,
    JWT_SECRET,
    { expiresIn: '7d' } as jwt.SignOptions
  );

  // Store hashed refresh token in DB for revocation support
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await setRefreshToken(userId, tokenHash, expiresAt);

  return token;
}

/**
 * Generate full token pair and return AuthTokens
 */
async function createTokenPair(user: UserPublic): Promise<AuthTokens> {
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes in seconds
  };
}

// ═══ Token Verification ═════════════════════════════════════════════════════

/**
 * Verify an access token and return payload
 */
export function verifyAccessToken(token: string): JwtAccessPayload {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.type !== 'access') {
      throw new AppError('Invalid token type', 401);
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      type: 'access',
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Access token has expired', 401);
    }
    throw new AppError('Invalid access token', 401);
  }
}

/**
 * Verify a refresh token (checks DB storage too)
 */
export async function verifyRefreshToken(token: string): Promise<JwtRefreshPayload> {
  let payload: any;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Refresh token has expired. Please log in again.', 401);
    }
    throw new AppError('Invalid refresh token', 401);
  }

  if (payload.type !== 'refresh') {
    throw new AppError('Invalid token type', 401);
  }

  // Check if token exists in DB (supports revocation)
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await findUserByRefreshToken(tokenHash);
  if (!user) {
    throw new AppError('Refresh token revoked or expired. Please log in again.', 401);
  }

  return { sub: payload.sub, jti: payload.jti, type: 'refresh' };
}

// ═══ Registration ═══════════════════════════════════════════════════════════

/**
 * Register a new user account
 */
export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<RegisterResult> {
  // Check for existing user
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new AppError('A user with this email already exists', 409);
  }

  // Hash password
  const password_hash = await hashPassword(password);

  // Create user
  const user = await createUser({ name, email, password_hash });

  // Generate tokens
  const tokens = await createTokenPair(user);

  return { user, tokens };
}

// ═══ Login ══════════════════════════════════════════════════════════════════

/**
 * Authenticate user with email and password
 */
export async function loginUser(
  email: string,
  password: string
): Promise<LoginResult> {
  // Find user with password hash
  const user = await findUserByEmail(email);
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new AppError('Invalid email or password', 401);
  }

  // Record login timestamp
  await recordLogin(user.id);

  const publicUser = toPublicUser(user);
  const tokens = await createTokenPair(publicUser);

  return { user: publicUser, tokens };
}

// ═══ Logout ═════════════════════════════════════════════════════════════════

/**
 * Logout user — invalidate all refresh tokens
 */
export async function logoutUser(userId: number): Promise<void> {
  await clearRefreshToken(userId);
}

/**
 * Logout all sessions — invalidate refresh token by hash
 */
export async function logoutByRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const user = await findUserByRefreshToken(tokenHash);
  if (user) {
    await clearRefreshToken(user.id);
  }
}

// ═══ Token Refresh ══════════════════════════════════════════════════════════

/**
 * Refresh access token using a valid refresh token
 * Implements refresh token rotation: old token is invalidated, new one issued
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenPair> {
  // Verify and check DB (this also validates existence)
  const payload = await verifyRefreshToken(refreshToken);

  // Get user
  const user = await findUserById(payload.sub);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Invalidate old refresh token (rotation)
  await clearRefreshToken(payload.sub);

  // Issue new token pair
  const accessToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user.id);

  return { accessToken, refreshToken: newRefreshToken };
}

// ═══ Email Verification ═════════════════════════════════════════════════════

/**
 * Generate and store an email verification token for a user
 * Returns the token to be sent via email
 */
export async function sendVerificationEmail(userId: number): Promise<string> {
  const user = await findUserByIdFull(userId);
  if (!user) throw new AppError('User not found', 404);

  if (user.email_verified) {
    throw new AppError('Email already verified', 400);
  }

  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRES_MS);
  await setVerificationToken(userId, token, expiresAt);

  return token;
}

/**
 * Verify a user's email using a verification token
 */
export async function verifyEmail(token: string): Promise<UserPublic> {
  const user = await findUserByVerificationToken(token);
  if (!user) {
    throw new AppError('Invalid or expired verification token', 400);
  }

  await verifyUserEmail(user.id);

  return toPublicUser({ ...user, email_verified: true });
}

// ═══ Password Reset ═════════════════════════════════════════════════════════

/**
 * Initiate password reset — generate a reset token
 * Returns the token to be sent via email
 * NOTE: Always returns success to prevent email enumeration
 */
export async function initiatePasswordReset(email: string): Promise<{ token: string; email: string } | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    // Don't reveal whether the email exists
    return null;
  }

  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MS);
  await setResetToken(user.id, token, expiresAt);

  return { token, email: user.email };
}

/**
 * Reset password using a valid reset token
 */
export async function completePasswordReset(
  token: string,
  newPassword: string
): Promise<void> {
  const user = await findUserByResetToken(token);
  if (!user) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  // Hash new password
  const newHash = await hashPassword(newPassword);

  // Reset password and clear token
  await resetPasswordInDb(user.id, newHash);

  // Invalidate all existing sessions (security best practice)
  await clearRefreshToken(user.id);
}

// ═══ Password Change (Authenticated) ════════════════════════════════════════

/**
 * Change password while logged in (requires current password)
 */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await findUserByIdFull(userId);
  if (!user) throw new AppError('User not found', 404);

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  // Hash and save new password
  const newHash = await hashPassword(newPassword);
  await updatePassword(userId, newHash);

  // Invalidate all sessions (force re-login on all devices)
  await clearRefreshToken(userId);
}

// ═══ Get Current User ══════════════════════════════════════════════════════

/**
 * Get current user profile
 */
export async function getCurrentUser(userId: number): Promise<UserPublic> {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return user;
}

// ═══ OAuth Integration ═════════════════════════════════════════════════════

/**
 * Handle OAuth login/registration
 * If the OAuth account exists → login
 * If the email matches an existing user → link accounts and login
 * Otherwise → create new user
 */
export async function oauthAuthenticate(
  provider: 'google' | 'github',
  providerUserId: string,
  profile: {
    email: string;
    name: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpires?: Date;
  }
): Promise<LoginResult> {
  // Check if OAuth account already exists
  const existingOAuth = await findOAuthAccount(provider, providerUserId);

  if (existingOAuth) {
    // Existing OAuth user — log them in
    const user = await findUserById(existingOAuth.user_id);
    if (!user) {
      throw new AppError('Linked user account not found', 500);
    }

    // Update OAuth tokens
    await linkOAuthAccount({
      userId: existingOAuth.user_id,
      provider,
      providerUserId,
      providerEmail: profile.email,
      accessToken: profile.accessToken,
      refreshToken: profile.refreshToken,
      tokenExpires: profile.tokenExpires,
    });

    await recordLogin(existingOAuth.user_id);
    const tokens = await createTokenPair(user);

    return {
      user: { ...user, email_verified: true },
      tokens,
    };
  }

  // Check if email matches an existing user → link accounts
  const existingEmailUser = await findUserByEmail(profile.email);
  if (existingEmailUser) {
    // Link OAuth to existing user
    await linkOAuthAccount({
      userId: existingEmailUser.id,
      provider,
      providerUserId,
      providerEmail: profile.email,
      accessToken: profile.accessToken,
      refreshToken: profile.refreshToken,
      tokenExpires: profile.tokenExpires,
    });

    await recordLogin(existingEmailUser.id);
    const publicUser = toPublicUser(existingEmailUser);
    const tokens = await createTokenPair(publicUser);

    return { user: publicUser, tokens };
  }

  // New user — create account
  // OAuth users don't have a password — use a random hash
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const password_hash = await hashPassword(randomPassword);

  const newUser = await createUser({
    name: profile.name,
    email: profile.email,
    password_hash,
  });

  // Mark email as verified (OAuth providers verify emails themselves)
  if (newUser.id) {
    await verifyUserEmail(newUser.id);
  }

  // Create OAuth link
  await linkOAuthAccount({
    userId: newUser.id,
    provider,
    providerUserId,
    providerEmail: profile.email,
    accessToken: profile.accessToken,
    refreshToken: profile.refreshToken,
    tokenExpires: profile.tokenExpires,
  });

  const user = await findUserByIdFull(newUser.id);
  const publicUser = toPublicUser(user!);
  const tokens = await createTokenPair(publicUser);

  return { user: publicUser, tokens };
}

/**
 * Get linked OAuth accounts for a user
 */
export async function getLinkedAccounts(userId: number): Promise<{
  id: number;
  provider: string;
  providerEmail: string | null;
  created_at: Date;
}[]> {
  const accounts = await getUserOAuthAccounts(userId);
  return accounts.map((a) => ({
    id: a.id,
    provider: a.provider,
    providerEmail: a.provider_email,
    created_at: a.created_at,
  }));
}

/**
 * Unlink an OAuth account (user must keep at least password if unlinking all OAuth)
 */
export async function unlinkAccount(
  userId: number,
  provider: 'google' | 'github'
): Promise<void> {
  const accounts = await getUserOAuthAccounts(userId);

  // If this is the only auth method and user has no password set
  if (accounts.length <= 1) {
    const user = await findUserByIdFull(userId);
    if (user && !user.password_hash) {
      throw new AppError(
        'Cannot unlink your only authentication method. Set a password first.',
        400
      );
    }
  }

  const deleted = await unlinkOAuthAccount(userId, provider);
  if (!deleted) {
    throw new AppError('OAuth account not found', 404);
  }
}
