/**
 * paymentRoutes.ts - Payment & Subscription API Routes
 * MovieAnimation Backend - Stripe Phase
 */

import { Router, raw } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createCheckout,
  getMySubscription,
  cancelMySubscription,
  reactivateMySubscription,
  getPlans,
} from '../controllers/paymentController';
import { handleWebhook } from '../controllers/webhookController';

const router = Router();

// Public routes
// Webhook must use raw body parser for Stripe signature verification
router.post('/webhook', raw({ type: 'application/json' }), handleWebhook);

// Plan listing (requires auth to see pricing)
router.get('/plans', authenticateToken, getPlans);

// Protected routes (require valid JWT)
router.post('/create-checkout', authenticateToken, createCheckout);
router.get('/subscription', authenticateToken, getMySubscription);
router.post('/subscription/cancel', authenticateToken, cancelMySubscription);
router.post('/subscription/reactivate', authenticateToken, reactivateMySubscription);

export default router;
