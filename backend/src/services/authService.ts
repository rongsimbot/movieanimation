/**
 * authService.ts - Authentication Business Logic
 * MovieAnimation Backend - Phase 2 Auth
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { findUserByEmail, createUser, findUserById, UserPublic } from '../models/userModel';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}

export interface RegisterResult {
  user: UserPublic;
  tokens: AuthTokens;
}

export interface LoginResult {
  user: UserPublic;
  tokens: AuthTokens;
}

/**
 * Register a new user
 */
export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<RegisterResult> {
  // Check if user already exists
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new AppError('A user with this email already exists', 409);
  }

  // Hash password
  const salt = await bcrypt.genSalt(12);
  const password_hash = await bcrypt.hash(password, salt);

  // Create user in database
  const user = await createUser({ name, email, password_hash });

  // Generate tokens
  const tokens = generateTokens(user);

  return { user, tokens };
}

/**
 * Login an existing user
 */
export async function loginUser(
  email: string,
  password: string
): Promise<LoginResult> {
  // Find user
  const user = await findUserByEmail(email);
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new AppError('Invalid email or password', 401);
  }

  const { password_hash, ...publicUser } = user;

  // Generate tokens
  const tokens = generateTokens(publicUser);

  return { user: publicUser, tokens };
}

/**
 * Get current user from token payload
 */
export async function getCurrentUser(userId: number): Promise<UserPublic> {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return user;
}

/**
 * Generate JWT access token
 */
function generateTokens(user: UserPublic): AuthTokens {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: '24h',
  } as jwt.SignOptions);

  return {
    accessToken,
    expiresIn: '24h',
  };
}

/**
 * Verify a JWT token and return the payload
 */
export function verifyToken(token: string): jwt.JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Token has expired', 401);
    }
    throw new AppError('Invalid token', 401);
  }
}

/**
 * Application-level error with HTTP status code
 */
export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}
