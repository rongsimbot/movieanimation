/**
 * authController.ts - Enhanced Authentication Route Handlers
 * MovieAnimation Backend - Phase 9: User Authentication
 *
 * Endpoints: register, login, logout, me, profile, deleteAccount,
 *   refreshToken, verifyEmail, resendVerification,
 *   forgotPassword, resetPassword, changePassword,
 *   oauth/google, oauth/github, oauth/callback, linkedAccounts, unlinkAccount
 */

import { Request, Response, NextFunction } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  logoutByRefreshToken,
  getCurrentUser,
  refreshAccessToken,
  sendVerificationEmail,
  verifyEmail,
  initiatePasswordReset,
  completePasswordReset,
  changePassword,
  oauthAuthenticate,
  getLinkedAccounts,
  unlinkAccount,
  AppError,
} from '../services/authService';
import { updateUser, deleteUser } from '../models/userModel';
import {
  validateRegisterInput,
  validateLoginInput,
  validateProfileUpdate,
  validatePasswordReset,
  validatePasswordChange,
  validateChangePassword,
} from '../validators/authValidator';
import { AuthRequest } from '../middleware/auth';

/**
 * POST /api/auth/register
 */
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = validateRegisterInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const { name, email, password } = req.body;
    const result = await registerUser(name.trim(), email, password);

    res.status(201).json({
      message: 'Registration successful',
      user: result.user,
      tokens: result.tokens,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
};

/**
 * POST /api/auth/login
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = validateLoginInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const { email, password } = req.body;
    const result = await loginUser(email, password);

    res.json({
      message: 'Login successful',
      user: result.user,
      tokens: result.tokens,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
};

/**
 * POST /api/auth/logout
 * Invalidate the current session's refresh token
 */
export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    // If we have a specific refresh token, invalidate just that session
    if (refreshToken) {
      await logoutByRefreshToken(refreshToken);
    } else if (req.user?.sub) {
      // Otherwise invalidate all sessions
      await logoutUser(req.user.sub);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * POST /api/auth/refresh
 * Refresh the access token using a valid refresh token
 */
export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const tokens = await refreshAccessToken(token);

    res.json({
      message: 'Token refreshed successfully',
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: 15 * 60,
      },
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
export const me = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await getCurrentUser(userId);
    const linkedAccounts = await getLinkedAccounts(userId);

    res.json({ user, linkedAccounts });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * PUT /api/auth/profile
 */
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const validation = validateProfileUpdate(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const { name, email } = req.body;
    const updated = await updateUser(userId, { name, email });
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Profile updated successfully', user: updated });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * DELETE /api/auth/account
 */
export const deleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const deleted = await deleteUser(userId);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

// ═══ Email Verification ═════════════════════════════════════════════════════

/**
 * POST /api/auth/verify-email
 * Verify email using a token
 */
export const verifyEmailHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const user = await verifyEmail(token);
    res.json({ message: 'Email verified successfully', user });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * POST /api/auth/resend-verification
 * Resend email verification (authenticated)
 */
export const resendVerification = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const token = await sendVerificationEmail(userId);

    // In production, send email here
    // For now, return token in dev mode
    res.json({
      message: 'Verification email sent',
      ...(process.env.NODE_ENV === 'development' && { verificationToken: token }),
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

// ═══ Password Reset ═════════════════════════════════════════════════════════

/**
 * POST /api/auth/forgot-password
 * Initiate password reset flow
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await initiatePasswordReset(email);

    // Always return success to prevent email enumeration
    res.json({
      message: 'If an account with that email exists, a password reset link has been sent.',
      ...(process.env.NODE_ENV === 'development' && result && { resetToken: result.token }),
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * POST /api/auth/reset-password
 * Complete password reset using a token
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = validatePasswordReset(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const { token, password } = req.body;
    await completePasswordReset(token, password);

    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * POST /api/auth/change-password
 * Change password while authenticated (requires current password)
 */
export const changePasswordHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const validation = validateChangePassword(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const { currentPassword, newPassword } = req.body;
    await changePassword(userId, currentPassword, newPassword);

    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

// ═══ OAuth Integration ══════════════════════════════════════════════════════

/**
 * GET /api/auth/oauth/:provider
 * Redirect to OAuth provider's authorization page
 */
export const oauthLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;

    if (provider !== 'google' && provider !== 'github') {
      return res.status(400).json({ error: 'Unsupported OAuth provider. Use "google" or "github".' });
    }

    let authUrl: string;

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/oauth/google/callback`;

      if (!clientId) {
        return res.status(501).json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID in environment.' });
      }

      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('openid email profile')}&` +
        `access_type=offline&` +
        `prompt=consent`;
    } else {
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        return res.status(501).json({ error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID in environment.' });
      }

      authUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `scope=${encodeURIComponent('user:email')}&` +
        `redirect_uri=${encodeURIComponent(process.env.GITHUB_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/oauth/github/callback`)}`;
    }

    // Return the URL — frontend handles the redirect
    // (Avoids redirect issues with SPA frontends)
    res.json({ url: authUrl });
  } catch (err: any) {
    next(err);
  }
};

/**
 * POST /api/auth/oauth/:provider/callback
 * Exchange OAuth code for tokens (server-side flow)
 */
export const oauthCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    if (provider !== 'google' && provider !== 'github') {
      return res.status(400).json({ error: 'Unsupported OAuth provider' });
    }

    // Exchange code for tokens and user profile
    let profile: { email: string; name: string; providerUserId: string; accessToken?: string; refreshToken?: string };

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/oauth/google/callback`;

      if (!clientId || !clientSecret) {
        return res.status(501).json({ error: 'Google OAuth is not fully configured' });
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json() as any;
      if (!tokenResponse.ok || tokenData.error) {
        return res.status(400).json({ error: tokenData.error_description || 'Failed to exchange OAuth code' });
      }

      // Get user info
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userResponse.json() as any;

      profile = {
        providerUserId: userData.id,
        email: userData.email,
        name: userData.name || userData.email,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
      };
    } else {
      // GitHub
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(501).json({ error: 'GitHub OAuth is not fully configured' });
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      });

      const tokenData = await tokenResponse.json() as any;
      if (!tokenResponse.ok || tokenData.error) {
        return res.status(400).json({ error: tokenData.error_description || 'Failed to exchange OAuth code' });
      }

      // Get GitHub user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userResponse.json() as any;

      // Get email (GitHub may not expose it in base user response)
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const emails = await emailResponse.json() as any[];
      const primaryEmail = emails?.find((e: any) => e.primary)?.email || userData.email;

      profile = {
        providerUserId: String(userData.id),
        email: primaryEmail,
        name: userData.name || userData.login,
        accessToken: tokenData.access_token,
      };
    }

    // Authenticate or create user
    const result = await oauthAuthenticate(
      provider as 'google' | 'github',
      profile.providerUserId,
      {
        email: profile.email,
        name: profile.name,
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
      }
    );

    res.json({
      message: `${provider} login successful`,
      user: result.user,
      tokens: result.tokens,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

/**
 * GET /api/auth/oauth/accounts
 * Get linked OAuth accounts
 */
export const linkedAccounts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const accounts = await getLinkedAccounts(userId);
    res.json({ accounts });
  } catch (err: any) {
    next(err);
  }
};

/**
 * DELETE /api/auth/oauth/:provider
 * Unlink an OAuth account
 */
export const unlinkOAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { provider } = req.params;
    if (provider !== 'google' && provider !== 'github') {
      return res.status(400).json({ error: 'Unsupported provider' });
    }

    await unlinkAccount(userId, provider as 'google' | 'github');
    res.json({ message: `${provider} account unlinked successfully` });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};
