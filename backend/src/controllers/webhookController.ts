/**
 * webhookController.ts - Stripe Webhook Handler
 * MovieAnimation Backend - Stripe Phase
 *
 * Receives Stripe webhook events and updates local database.
 * IMPORTANT: This route must use raw body (express.raw) for signature verification.
 */

import { Request, Response } from 'express';
import {
  constructWebhookEvent,
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaid,
} from '../services/stripeService';
import type Stripe from 'stripe';

/**
 * POST /api/payments/webhook
 * Stripe webhook receiver — processes payment/subscription events.
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;
  try {
    // req.body must be a raw Buffer — see stripeRoutes.ts for express.raw() middleware
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
    event = await constructWebhookEvent(rawBody, signature);
  } catch (err: any) {
    console.error('[Stripe] ⚠️ Webhook signature verification failed:', err.message);
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    return;
  }

  // Process event asynchronously — always return 200 quickly
  res.status(200).json({ received: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn(`[Stripe] ⚠️ Invoice payment failed for ${invoice.customer}: ${invoice.id}`);
        break;
      }

      default: {
        console.log(`[Stripe] ℹ️ Unhandled event type: ${event.type}`);
      }
    }
  } catch (err: any) {
    console.error(`[Stripe] ❌ Error processing ${event.type}:`, err.message);
  }
};
