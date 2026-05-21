/**
 * analyticsService.ts - Phase 11: Analytics & Usage Tracking
 * 
 * Tracks platform usage metrics:
 * - Page views and user sessions
 * - API call counts by endpoint
 * - Video generation metrics
 * - Project creation and completion
 * - User engagement (DAU, MAU)
 * 
 * Uses PostgreSQL for persistence.
 */

import pool from '../config/database';

// ─── Types ──────────────────────────────────────────────────────

export interface AnalyticsEvent {
  eventType: string;
  userId?: number;
  projectId?: number;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface UsageStats {
  totalUsers: number;
  activeUsersToday: number;
  activeUsersThisMonth: number;
  totalProjects: number;
  projectsCreatedToday: number;
  totalVideoGenerations: number;
  videoGenerationsToday: number;
  totalApiCalls: number;
  apiCallsToday: number;
  averageSessionTime: number;
}

export interface CostMetrics {
  totalSpent: number;
  spentToday: number;
  spentThisMonth: number;
  byProvider: Record<string, number>;
  byProject: Array<{ projectId: number; projectTitle: string; cost: number }>;
  projectedMonthly: number;
}

// ─── Ensure Analytics Table ─────────────────────────────────────

export async function ensureAnalyticsTable(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        project_id INTEGER,
        metadata JSONB DEFAULT '{}',
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);
    `);
  } finally {
    client.release();
  }
}

// ─── Track Event ────────────────────────────────────────────────

export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO analytics_events (event_type, user_id, project_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.eventType,
        event.userId || null,
        event.projectId || null,
        JSON.stringify(event.metadata || {}),
        event.ipAddress || null,
        event.userAgent || null,
      ]
    );
  } catch (err) {
    // Don't fail the request if analytics fails
    console.error('[Analytics] Failed to track event:', err);
  } finally {
    client.release();
  }
}

// ─── Get Usage Statistics ───────────────────────────────────────

export async function getUsageStats(userId?: number): Promise<UsageStats> {
  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().split('T')[0];

    // Total users
    const userResult = await client.query('SELECT COUNT(*) as total FROM users');
    const totalUsers = parseInt(userResult.rows[0].total, 10);

    // Active users today
    const dauResult = await client.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM analytics_events 
       WHERE event_type = 'page_view' AND created_at::date = $1`,
      [today]
    );
    const activeUsersToday = parseInt(dauResult.rows[0].count, 10);

    // Active users this month
    const mauResult = await client.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM analytics_events 
       WHERE event_type = 'page_view' AND created_at::date >= $1`,
      [monthStart]
    );
    const activeUsersThisMonth = parseInt(mauResult.rows[0].count, 10);

    // Total projects
    const projectResult = await client.query('SELECT COUNT(*) as total FROM projects');
    const totalProjects = parseInt(projectResult.rows[0].total, 10);

    // Projects created today
    const projectTodayResult = await client.query(
      'SELECT COUNT(*) as count FROM projects WHERE created_at::date = $1',
      [today]
    );
    const projectsCreatedToday = parseInt(projectTodayResult.rows[0].count, 10);

    // Video generations
    const genResult = await client.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at::date = $1) as today
       FROM video_clips`,
      [today]
    );
    const totalVideoGenerations = parseInt(genResult.rows[0].total, 10);
    const videoGenerationsToday = parseInt(genResult.rows[0].today, 10);

    // API calls
    const apiResult = await client.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at::date = $1) as today
       FROM analytics_events WHERE event_type = 'api_call'`,
      [today]
    );
    const totalApiCalls = parseInt(apiResult.rows[0].total, 10);
    const apiCallsToday = parseInt(apiResult.rows[0].today, 10);

    return {
      totalUsers,
      activeUsersToday,
      activeUsersThisMonth,
      totalProjects,
      projectsCreatedToday,
      totalVideoGenerations,
      videoGenerationsToday,
      totalApiCalls,
      apiCallsToday,
      averageSessionTime: 0,
    };
  } finally {
    client.release();
  }
}

// ─── Get Cost Metrics ───────────────────────────────────────────

export async function getCostMetrics(userId?: number): Promise<CostMetrics> {
  const client = await pool.connect();
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString().split('T')[0];

    // Total costs from video_clips
    const costResult = await client.query(
      `SELECT 
        COALESCE(SUM(cost), 0) as total,
        COALESCE(SUM(cost) FILTER (WHERE created_at::date = $1), 0) as today,
        COALESCE(SUM(cost) FILTER (WHERE created_at::date >= $2), 0) as month
       FROM video_clips`,
      [today, monthStart]
    );
    const totalSpent = parseFloat(costResult.rows[0].total);
    const spentToday = parseFloat(costResult.rows[0].today);
    const spentThisMonth = parseFloat(costResult.rows[0].month);

    // By provider
    const providerResult = await client.query(
      `SELECT api_used, COALESCE(SUM(cost), 0) as total 
       FROM video_clips WHERE cost IS NOT NULL 
       GROUP BY api_used ORDER BY total DESC`
    );
    const byProvider: Record<string, number> = {};
    for (const row of providerResult.rows) {
      byProvider[row.api_used || 'unknown'] = parseFloat(row.total);
    }

    // By project (top 5)
    const projectResult = await client.query(
      `SELECT vc.project_id, COALESCE(SUM(vc.cost), 0) as cost 
       FROM video_clips vc 
       WHERE vc.cost IS NOT NULL AND vc.project_id IS NOT NULL 
       GROUP BY vc.project_id ORDER BY cost DESC LIMIT 5`
    );
    const byProject = projectResult.rows.map(r => ({
      projectId: r.project_id,
      projectTitle: `Project #${r.project_id}`,
      cost: parseFloat(r.cost),
    }));

    // Projected monthly (extrapolate from this month so far)
    const dayOfMonth = new Date().getDate();
    const projectedMonthly = dayOfMonth > 0 
      ? (spentThisMonth / dayOfMonth) * new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
      : spentThisMonth;

    return {
      totalSpent,
      spentToday,
      spentThisMonth,
      byProvider,
      byProject,
      projectedMonthly: Math.round(projectedMonthly * 100) / 100,
    };
  } finally {
    client.release();
  }
}

// ─── Get Daily Active Users Trend ────────────────────────────────

export async function getDAUTrend(days: number = 7): Promise<Array<{ date: string; count: number }>> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 
        created_at::date as date,
        COUNT(DISTINCT user_id) as count
       FROM analytics_events 
       WHERE event_type = 'page_view' AND created_at >= NOW() - INTERVAL '1 day' * $1
       GROUP BY created_at::date 
       ORDER BY date DESC`,
      [days]
    );
    return result.rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      count: parseInt(r.count, 10),
    }));
  } finally {
    client.release();
  }
}

// ─── Get Top Endpoints ──────────────────────────────────────────

export async function getTopEndpoints(days: number = 7): Promise<Array<{ endpoint: string; count: number }>> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 
        metadata->>'endpoint' as endpoint,
        COUNT(*) as count
       FROM analytics_events 
       WHERE event_type = 'api_call' AND created_at >= NOW() - INTERVAL '1 day' * $1
       GROUP BY metadata->>'endpoint' 
       ORDER BY count DESC
       LIMIT 10`,
      [days]
    );
    return result.rows.map(r => ({
      endpoint: r.endpoint || 'unknown',
      count: parseInt(r.count, 10),
    }));
  } finally {
    client.release();
  }
}
