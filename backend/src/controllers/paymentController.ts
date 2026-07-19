/**
 * paymentController.ts - Payment & Subscription Route Handlers
 * MovieAnimation Backend - Stripe Phase
 *
 * Authenticated endpoints for creating checkout sessions,
 * viewing/canceling/reactivating subscriptions.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createCheckoutSession,
  getSubscription,
  cancelSubscription,
  reactivateSubscription,
  AppError,
} from '../services/stripeService';

// ─── POST /api/payments/create-checkout ────────────────────────────────

export const createCheckout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    const userEmail = req.user?.email;

    if (!userId || !userEmail) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { planId, successUrl, cancelUrl } = req.body;

    if (!planId || !['pro_monthly', 'pro_yearly'].includes(planId)) {
      return res.status(400).json({
        error: 'Invalid plan',
        details: 'planId must be "pro_monthly" or "pro_yearly"',
      });
    }

    if (!successUrl || !cancelUrl) {
      return res.status(400).json({
        error: 'Missing URLs',
        details: 'Both successUrl and cancelUrl are required',
      });
    }

    const result = await createCheckoutSession({
      planId,
      successUrl,
      cancelUrl,
      userId,
      userEmail,
    });

    res.json({
      message: 'Checkout session created',
      ...result,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

// ─── GET /api/payments/subscription ────────────────────────────────────

export const getMySubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const subscription = await getSubscription(userId);

    if (!subscription) {
      return res.json({
        hasSubscription: false,
        subscription: null,
      });
    }

    res.json({
      hasSubscription: true,
      subscription,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

// ─── POST /api/payments/subscription/cancel ────────────────────────────

export const cancelMySubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const subscription = await cancelSubscription(userId);

    res.json({
      message: 'Subscription will be canceled at the end of the billing period',
      subscription,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

// ─── POST /api/payments/subscription/reactivate ────────────────────────

export const reactivateMySubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const subscription = await reactivateSubscription(userId);

    res.json({
      message: 'Subscription reactivated',
      subscription,
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
};

// ─── GET /api/payments/plans ───────────────────────────────────────────

export const getPlans = async (_req: AuthRequest, res: Response) => {
  res.json({
    plans: [
      {
        id: 'pro_monthly',
        name: 'Pro Monthly',
        price: '29',
        currency: 'USD',
        interval: 'month',
        features: [
          'Unlimited video generations',
          '1080p export quality',
          'Priority processing queue',
          'Advanced character customization',
          'Script-to-video AI parsing',
          'Timeline editor',
        ],
      },
      {
        id: 'pro_yearly',
        name: 'Pro Yearly',
        price: '290',
        currency: 'USD',
        interval: 'year',
        features: [
          'Everything in Pro Monthly',
          '2 months free (save ~17%)',
          'Early access to new features',
          'Priority support',
        ],
      },
    ],
  });
};
