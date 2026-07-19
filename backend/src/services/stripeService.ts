/**
 * stripeService.ts - Stripe Payment Integration
 * MovieAnimation Backend - Stripe Phase
 *
 * Handles Stripe checkout sessions, subscriptions, webhooks.
 * Requires STRIPE_SECRET_KEY in environment.
 */

import Stripe from 'stripe';

// Plan price IDs — set in Stripe Dashboard > Products > Pricing
const PLANS = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly_placeholder',
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || 'price_pro_yearly_placeholder',
} as const;

type PlanId = keyof typeof PLANS;

export type { PlanId };

// ─── Stripe Client ────────────────────────────────────────────────────────

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    if (!STRIPE_KEY) {
      throw new AppError('Stripe is not configured. Set STRIPE_SECRET_KEY.', 503);
    }
    stripe = new Stripe(STRIPE_KEY, {
      apiVersion: '2025-01-27.acacia' as any,
    });
  }
  return stripe;
}

export function getWebhookSecret(): string {
  if (!WEBHOOK_SECRET) {
    throw new AppError('Stripe webhook secret is not configured.', 503);
  }
  return WEBHOOK_SECRET;
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface CreateCheckoutInput {
  planId: PlanId;
  successUrl: string;
  cancelUrl: string;
  userId: number;
  userEmail: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export interface SubscriptionInfo {
  id: string;
  status: string;
  planId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  customerId: string;
}

// ─── Checkout Session ─────────────────────────────────────────────────────

export async function createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult> {
  const stripeClient = getStripe();
  const priceId = PLANS[input.planId];

  if (!priceId || priceId.startsWith('price_placeholder')) {
    throw new AppError(`Invalid plan: "${input.planId}". Configure price IDs in .env.`, 400);
  }

  // Find or create Stripe customer for this user
  const customerId = await findOrCreateCustomer(input.userId, input.userEmail);

  const session = await stripeClient.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      userId: String(input.userId),
      planId: input.planId,
    },
    subscription_data: {
      metadata: {
        userId: String(input.userId),
        planId: input.planId,
      },
    },
  });

  if (!session.url || !session.id) {
    throw new AppError('Failed to create checkout session.', 500);
  }

  return { sessionId: session.id, url: session.url };
}

// ─── Customer Management ──────────────────────────────────────────────────

async function findOrCreateCustomer(userId: number, email: string): Promise<string> {
  const stripeClient = getStripe();

  // Check DB for existing Stripe customer ID
  const existing = await getCustomerIdFromDb(userId);
  if (existing) {
    // Verify customer still exists in Stripe
    try {
      await stripeClient.customers.retrieve(existing);
      return existing;
    } catch {
      // Customer deleted from Stripe — create new one
    }
  }

  const customer = await stripeClient.customers.create({
    email,
    metadata: { userId: String(userId) },
  });

  await saveCustomerIdToDb(userId, customer.id);
  return customer.id;
}

async function getCustomerIdFromDb(userId: number): Promise<string | null> {
  try {
    const pool = (await import('../config/database')).default;
    const result = await pool.query<{ stripe_customer_id: string }>(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.stripe_customer_id || null;
  } catch {
    return null;
  }
}

async function saveCustomerIdToDb(userId: number, customerId: string): Promise<void> {
  try {
    const pool = (await import('../config/database')).default;
    await pool.query(
      'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
      [customerId, userId]
    );
  } catch (err) {
    console.warn('[Stripe] Could not save customer ID to DB:', err);
  }
}

// ─── Subscription Management ──────────────────────────────────────────────

export async function getSubscription(userId: number): Promise<SubscriptionInfo | null> {
  const stripeClient = getStripe();
  const customerId = await getCustomerIdFromDb(userId);

  if (!customerId) return null;

  const subs = await stripeClient.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  });

  if (subs.data.length === 0) {
    // Check for trialing or past_due
    const allSubs = await stripeClient.subscriptions.list({
      customer: customerId,
      limit: 1,
    });
    if (allSubs.data.length === 0) return null;

    const sub = allSubs.data[0];
    return formatSubscription(sub);
  }

  return formatSubscription(subs.data[0]);
}

export async function cancelSubscription(userId: number): Promise<SubscriptionInfo> {
  const stripeClient = getStripe();
  const subscription = await getUserActiveSubscription(userId);

  if (!subscription) {
    throw new AppError('No active subscription found.', 404);
  }

  const canceled = await stripeClient.subscriptions.update(subscription.id, {
    cancel_at_period_end: true,
  });

  return formatSubscription(canceled);
}

export async function reactivateSubscription(userId: number): Promise<SubscriptionInfo> {
  const stripeClient = getStripe();
  const subscription = await getUserActiveSubscription(userId);

  if (!subscription) {
    throw new AppError('No subscription found.', 404);
  }

  const reactivated = await stripeClient.subscriptions.update(subscription.id, {
    cancel_at_period_end: false,
  });

  return formatSubscription(reactivated);
}

async function getUserActiveSubscription(userId: number): Promise<Stripe.Subscription | null> {
  const stripeClient = getStripe();
  const customerId = await getCustomerIdFromDb(userId);
  if (!customerId) return null;

  const subs = await stripeClient.subscriptions.list({
    customer: customerId,
    limit: 1,
    status: 'active',
  });

  return subs.data[0] || null;
}

function formatSubscription(sub: Stripe.Subscription): SubscriptionInfo {
  return {
    id: sub.id,
    status: sub.status,
    planId: sub.metadata.planId || 'unknown',
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
  };
}

// ─── Webhook Event Processing ─────────────────────────────────────────────

export async function constructWebhookEvent(payload: Buffer, signature: string): Promise<Stripe.Event> {
  const stripeClient = getStripe();
  const secret = getWebhookSecret();
  return stripeClient.webhooks.constructEvent(payload, signature, secret);
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;

  if (!userId) {
    console.warn('[Stripe] Checkout completed without userId metadata');
    return;
  }

  console.log(`[Stripe] ✅ Subscription completed for user ${userId}, plan: ${planId}`);
  // DB updates happen through webhook events below
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata?.userId;
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!userId || !customerId) {
    console.warn('[Stripe] Subscription update without metadata');
    return;
  }

  try {
    const pool = (await import('../config/database')).default;

    await pool.query(
      `INSERT INTO user_subscriptions (user_id, stripe_subscription_id, stripe_customer_id, status, plan_id, current_period_start, current_period_end, cancel_at_period_end)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6), to_timestamp($7), $8)
       ON CONFLICT (stripe_subscription_id) DO UPDATE SET
         status = EXCLUDED.status,
         plan_id = EXCLUDED.plan_id,
         current_period_start = EXCLUDED.current_period_start,
         current_period_end = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         updated_at = NOW()`,
      [
        parseInt(userId, 10),
        subscription.id,
        customerId,
        subscription.status,
        subscription.metadata?.planId || 'unknown',
        subscription.current_period_start,
        subscription.current_period_end,
        subscription.cancel_at_period_end,
      ]
    );

    console.log(`[Stripe] 📝 Subscription record updated for user ${userId}: ${subscription.status}`);
  } catch (err) {
    console.error('[Stripe] Failed to update subscription in DB:', err);
  }
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  try {
    const pool = (await import('../config/database')).default;
    await pool.query(
      `UPDATE user_subscriptions SET status = 'canceled', updated_at = NOW()
       WHERE stripe_subscription_id = $1`,
      [subscription.id]
    );
    console.log(`[Stripe] ❌ Subscription canceled for user ${userId}`);
  } catch (err) {
    console.error('[Stripe] Failed to mark subscription canceled:', err);
  }
}

export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) return;

  console.log(`[Stripe] 💰 Invoice paid for customer ${customerId}: $${((invoice.amount_paid || 0) / 100).toFixed(2)}`);
}

// ─── Error Class ──────────────────────────────────────────────────────────

export class AppError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}
