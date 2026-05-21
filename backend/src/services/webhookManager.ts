/**
 * webhookManager.ts - Webhook Registration & Delivery Service
 *
 * Manages webhook registration, delivery, and retry for video generation
 * completion notifications. Supports multiple webhook URLs per project/user.
 *
 * Features:
 * - Webhook registration (per user, project, or global)
 * - Event type filtering (completion, failure, progress)
 * - Automatic retry with exponential backoff
 * - Delivery logging and statistics
 * - Signature verification (HMAC-SHA256)
 * - Dead letter queue for permanently failed webhooks
 */

import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ---- Types ----

export type WebhookEvent = 'job.completed' | 'job.failed' | 'job.progress' | 'batch.completed' | 'batch.failed' | 'batch.progress';

export interface WebhookRegistration {
  id: string;
  userId?: string;
  projectId?: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  deliveryCount: number;
  failureCount: number;
  lastDelivery?: string;
  lastFailure?: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: any;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  attempts: number;
  maxAttempts: number;
  nextRetry?: string;
  lastError?: string;
  createdAt: string;
  completedAt?: string;
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: {
    jobId?: string;
    batchId?: string;
    projectId?: string;
    sceneId?: string;
    status: string;
    result?: any;
    error?: string;
  };
}

// ---- Store ----

const WEBHOOK_STORE_PATH = process.env.WEBHOOK_STORE_PATH || path.join(__dirname, '../../data/webhooks.json');
const dataDir = path.dirname(WEBHOOK_STORE_PATH);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let registrations: WebhookRegistration[] = [];
let deliveries: WebhookDelivery[] = [];
const deliveryQueue: WebhookDelivery[] = [];

// Load persisted state
function loadState(): void {
  if (fs.existsSync(WEBHOOK_STORE_PATH)) {
    try {
      const raw = fs.readFileSync(WEBHOOK_STORE_PATH, 'utf-8');
      const state = JSON.parse(raw);
      registrations = state.registrations || [];
      deliveries = state.deliveries || [];
    } catch (err) {
      console.warn('[WebhookManager] Could not load state:', err);
    }
  }
}

function saveState(): void {
  try {
    fs.writeFileSync(WEBHOOK_STORE_PATH, JSON.stringify({
      registrations,
      deliveries: deliveries.slice(-1000), // Keep last 1000 deliveries
    }, null, 2), 'utf-8');
  } catch (err) {
    console.error('[WebhookManager] Failed to save state:', err);
  }
}

// ---- Registration ----

/**
 * Register a new webhook
 */
export function registerWebhook(options: {
  userId?: string;
  projectId?: string;
  url: string;
  secret?: string;
  events?: WebhookEvent[];
}): WebhookRegistration {
  const reg: WebhookRegistration = {
    id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    userId: options.userId,
    projectId: options.projectId,
    url: options.url,
    secret: options.secret,
    events: options.events || ['job.completed', 'job.failed'],
    active: true,
    createdAt: new Date().toISOString(),
    deliveryCount: 0,
    failureCount: 0,
  };

  registrations.push(reg);
  saveState();

  console.log(`[WebhookManager] ✅ Registered webhook ${reg.id} → ${reg.url} (events: ${reg.events.join(', ')})`);
  return reg;
}

/**
 * Unregister a webhook
 */
export function unregisterWebhook(webhookId: string): boolean {
  const idx = registrations.findIndex(r => r.id === webhookId);
  if (idx >= 0) {
    registrations.splice(idx, 1);
    saveState();
    console.log(`[WebhookManager] 🗑️ Unregistered webhook ${webhookId}`);
    return true;
  }
  return false;
}

/**
 * Update a webhook registration
 */
export function updateWebhook(
  webhookId: string,
  updates: Partial<Pick<WebhookRegistration, 'url' | 'secret' | 'events' | 'active'>>
): WebhookRegistration | null {
  const reg = registrations.find(r => r.id === webhookId);
  if (!reg) return null;

  Object.assign(reg, updates, { updatedAt: new Date().toISOString() });
  saveState();
  return reg;
}

/**
 * Get registrations (optionally filtered)
 */
export function getRegistrations(filter?: {
  userId?: string;
  projectId?: string;
  event?: WebhookEvent;
}): WebhookRegistration[] {
  let result = [...registrations];

  if (filter?.userId) {
    result = result.filter(r => !r.userId || r.userId === filter.userId);
  }
  if (filter?.projectId) {
    result = result.filter(r => !r.projectId || r.projectId === filter.projectId);
  }
  if (filter?.event) {
    result = result.filter(r => r.events.includes(filter.event!));
  }

  return result;
}

// ---- Delivery ----

const DELIVERY_CONFIG = {
  maxAttempts: 5,
  baseDelayMs: 5000,
  maxDelayMs: 300000, // 5 minutes
  backoffMultiplier: 2,
  timeoutMs: 10000,
};

/**
 * Fire a webhook event to all matching registrations
 */
export async function fireWebhook(
  event: WebhookEvent,
  data: WebhookPayload['data']
): Promise<void> {
  const matching = registrations.filter(r => {
    if (!r.active) return false;
    if (!r.events.includes(event)) return false;
    // Match project-specific webhooks
    if (r.projectId && data.projectId && r.projectId !== data.projectId) return false;
    return true;
  });

  if (matching.length === 0) {
    console.log(`[WebhookManager] No matching webhooks for event: ${event}`);
    return;
  }

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  console.log(`[WebhookManager] 📤 Firing ${event} to ${matching.length} webhook(s)`);

  const promises = matching.map(async (reg) => {
    await deliverWebhook(reg, payload);
  });

  // Fire and forget (don't block the caller)
  Promise.allSettled(promises).catch(err => {
    console.error('[WebhookManager] Bulk delivery error:', err);
  });
}

/**
 * Deliver a webhook payload to a single registration
 */
async function deliverWebhook(
  reg: WebhookRegistration,
  payload: WebhookPayload
): Promise<void> {
  const delivery: WebhookDelivery = {
    id: `d_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    webhookId: reg.id,
    event: payload.event,
    payload,
    status: 'pending',
    attempts: 0,
    maxAttempts: DELIVERY_CONFIG.maxAttempts,
    createdAt: new Date().toISOString(),
  };

  deliveries.push(delivery);
  await attemptDelivery(delivery, reg);
}

/**
 * Attempt to deliver a webhook (with retry)
 */
async function attemptDelivery(
  delivery: WebhookDelivery,
  reg: WebhookRegistration,
  attempt: number = 0
): Promise<void> {
  delivery.attempts = attempt + 1;
  delivery.status = attempt === 0 ? 'pending' : 'retrying';

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-ID': delivery.id,
      'X-Webhook-Event': delivery.event,
      'X-Delivery-Attempt': String(delivery.attempts),
    };

    // Add HMAC signature if secret is configured
    if (reg.secret) {
      const signature = generateSignature(JSON.stringify(delivery.payload), reg.secret);
      headers['X-Webhook-Signature'] = signature;
    }

    await axios.post(reg.url, delivery.payload, {
      headers,
      timeout: DELIVERY_CONFIG.timeoutMs,
    });

    // Success
    delivery.status = 'success';
    delivery.completedAt = new Date().toISOString();
    reg.deliveryCount++;
    reg.lastDelivery = new Date().toISOString();

    console.log(`[WebhookManager] ✅ Delivered ${delivery.event} → ${reg.url} (attempt ${delivery.attempts})`);
    saveState();
  } catch (error: any) {
    const status = error.response?.status || 0;

    // Don't retry on 4xx (except 429 rate limit)
    const isRetryable = status === 429 || status >= 500 || status === 0;

    if (!isRetryable || delivery.attempts >= delivery.maxAttempts) {
      // Permanent failure
      delivery.status = 'failed';
      delivery.lastError = error.message;
      delivery.completedAt = new Date().toISOString();
      reg.failureCount++;
      reg.lastFailure = new Date().toISOString();

      console.error(`[WebhookManager] ❌ Failed ${delivery.event} → ${reg.url}: ${error.message}`);
      saveState();
      return;
    }

    // Retry with exponential backoff
    const delay = Math.min(
      DELIVERY_CONFIG.baseDelayMs * Math.pow(DELIVERY_CONFIG.backoffMultiplier, delivery.attempts),
      DELIVERY_CONFIG.maxDelayMs
    );

    delivery.nextRetry = new Date(Date.now() + delay).toISOString();
    delivery.lastError = error.message;

    console.warn(`[WebhookManager] 🔄 Retrying ${delivery.event} → ${reg.url} in ${delay}ms (attempt ${delivery.attempts + 1}/${delivery.maxAttempts})`);

    setTimeout(async () => {
      await attemptDelivery(delivery, reg, delivery.attempts);
    }, delay);
  }
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Verify a webhook signature (for use by receiving endpoints)
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = generateSignature(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ---- Queries ----

/**
 * Get delivery history for a webhook
 */
export function getDeliveryHistory(webhookId: string, limit: number = 50): WebhookDelivery[] {
  return deliveries
    .filter(d => d.webhookId === webhookId)
    .slice(-limit)
    .reverse();
}

/**
 * Get delivery stats
 */
export function getDeliveryStats(): {
  total: number;
  successful: number;
  failed: number;
  pending: number;
  retrying: number;
} {
  const stats = {
    total: deliveries.length,
    successful: 0,
    failed: 0,
    pending: 0,
    retrying: 0,
  };

  for (const d of deliveries) {
    if (d.status === 'success') stats.successful++;
    else if (d.status === 'failed') stats.failed++;
    else if (d.status === 'retrying') stats.retrying++;
    else stats.pending++;
  }

  return stats;
}

/**
 * Retry all failed deliveries (admin action)
 */
export async function retryFailedDeliveries(): Promise<number> {
  const failed = deliveries.filter(d => d.status === 'failed');
  let retried = 0;

  for (const delivery of failed) {
    const reg = registrations.find(r => r.id === delivery.webhookId);
    if (!reg) continue;

    delivery.attempts = 0;
    delivery.status = 'pending';
    delivery.lastError = undefined;
    delivery.nextRetry = undefined;
    delivery.completedAt = undefined;

    await attemptDelivery(delivery, reg, 0);
    retried++;
  }

  return retried;
}

// ---- Health Check ----

export function getWebhookHealth(): {
  totalRegistrations: number;
  activeRegistrations: number;
  deliverySuccessRate: number;
} {
  const total = deliveries.length;
  const successful = deliveries.filter(d => d.status === 'success').length;

  return {
    totalRegistrations: registrations.length,
    activeRegistrations: registrations.filter(r => r.active).length,
    deliverySuccessRate: total > 0 ? Math.round((successful / total) * 100) : 100,
  };
}

// ---- Initialize ----

loadState();

// Periodic state saving
setInterval(() => {
  saveState();
}, 60000); // Every minute
