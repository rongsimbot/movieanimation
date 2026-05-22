/**
 * analyticsController.ts - Phase 11: Analytics & Cost Monitoring Controller
 */

import { Request, Response } from 'express';
import * as analyticsService from '../services/analyticsService';
import { apiCache } from '../services/cacheService';

// ─── Track Event ────────────────────────────────────────────────

export async function trackEvent(req: Request, res: Response): Promise<void> {
  try {
    const { eventType, metadata, projectId } = req.body;

    if (!eventType || typeof eventType !== 'string') {
      res.status(400).json({ error: 'eventType is required and must be a string' });
      return;
    }

    // Validate input lengths
    if (eventType.length > 100) {
      res.status(400).json({ error: 'eventType must be 100 characters or less' });
      return;
    }

    if (metadata) {
      const metadataStr = JSON.stringify(metadata);
      if (metadataStr.length > 1024) {
        res.status(400).json({ error: 'metadata payload too large (max 1KB)' });
        return;
      }
    }

    const userId = (req as any).user?.id;

    // Fire and forget — don't block response, but catch errors
    analyticsService.trackEvent({
      eventType,
      userId,
      projectId,
      metadata,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || undefined,
    }).catch((err) => {
      console.error(`[Analytics] Failed to track event "${eventType}":`, err.message);
    });

    res.status(202).json({ tracked: true, eventType });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Track Page View ────────────────────────────────────────────

export async function trackPageView(req: Request, res: Response): Promise<void> {
  try {
    const { page, referrer } = req.body;

    if (!page || typeof page !== 'string' || page.length > 500) {
      res.status(400).json({ error: 'page is required and must be 500 characters or less' });
      return;
    }

    const userId = (req as any).user?.id;

    analyticsService.trackEvent({
      eventType: 'page_view',
      userId,
      metadata: { page, referrer },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || undefined,
    }).catch((err) => {
      console.error(`[Analytics] Failed to track pageview for "${page}":`, err.message);
    });

    res.status(202).json({ tracked: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Usage Stats ────────────────────────────────────────────────

export async function getUsageStats(req: Request, res: Response): Promise<void> {
  try {
    // Cache for 30 seconds
    const cacheKey = 'analytics:usage';
    const cached = apiCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const stats = await analyticsService.getUsageStats();
    apiCache.set(cacheKey, stats, 30_000);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Cost Metrics ───────────────────────────────────────────────

export async function getCostMetrics(req: Request, res: Response): Promise<void> {
  try {
    const cacheKey = 'analytics:cost';
    const cached = apiCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const metrics = await analyticsService.getCostMetrics();
    apiCache.set(cacheKey, metrics, 30_000);
    res.json(metrics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── DAU Trend ──────────────────────────────────────────────────

export async function getDAUTrend(req: Request, res: Response): Promise<void> {
  try {
    const days = parseInt(req.query.days as string, 10) || 7;
    const trend = await analyticsService.getDAUTrend(Math.min(days, 90));
    res.json(trend);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Top Endpoints ──────────────────────────────────────────────

export async function getTopEndpoints(req: Request, res: Response): Promise<void> {
  try {
    const days = parseInt(req.query.days as string, 10) || 7;
    const endpoints = await analyticsService.getTopEndpoints(Math.min(days, 90));
    res.json(endpoints);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Cache Stats ────────────────────────────────────────────────

export function getCacheStats(_req: Request, res: Response): void {
  res.json(apiCache.getStats());
}
