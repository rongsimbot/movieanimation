/**
 * authRoutes.ts - Enhanced Authentication Routes
 * MovieAnimation Backend - Phase 9: User Authentication
 */

import { Router } from 'express';
import {
  register,
  login,
  logout,
  me,
  updateProfile,
  deleteAccount,
  refreshToken,
  verifyEmailHandler,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePasswordHandler,
  oauthLogin,
  oauthCallback,
  linkedAccounts,
  unlinkOAuth,
} from '../controllers/authController';
import { authenticateToken, getCsrfToken, csrfProtection } from '../middleware/auth';

const router = Router();

// ═══ Public Routes (no auth required) ══════════════════════════════════════

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshToken);

// Email verification (public — user clicks link in email)
router.post('/verify-email', verifyEmailHandler);

// Password reset (public — user clicks link in email)
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// OAuth — get auth URL
router.get('/oauth/:provider', oauthLogin);

// OAuth — exchange code for tokens (public, uses code not session)
router.post('/oauth/:provider/callback', oauthCallback);

// CSRF token endpoint (requires auth to get a token)
router.get('/csrf-token', authenticateToken, getCsrfToken);

// ═══ Protected Routes (require valid auth token) ══════════════════════════

router.get('/me', authenticateToken, me);
router.put('/profile', authenticateToken, updateProfile);
router.delete('/account', authenticateToken, deleteAccount);

// Logout — can work with or without auth token
router.post('/logout', authenticateToken, logout);

// Resend email verification (must be logged in)
router.post('/resend-verification', authenticateToken, resendVerification);

// Change password while authenticated
router.post('/change-password', authenticateToken, changePasswordHandler);

// OAuth linked accounts management
router.get('/oauth/accounts', authenticateToken, linkedAccounts);
router.delete('/oauth/:provider', authenticateToken, unlinkOAuth);

export default router;
