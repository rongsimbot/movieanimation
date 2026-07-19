/**
 * jobModel.ts - Job Tracking Database Model
 * MovieAnimation Backend - Phase 4 Redis Job Queue
 *
 * Centralized job tracking across all BullMQ queues with
 * dead letter queue support and audit logging.
 */

import pool from '../config/database';

// ─── Types ────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled' | 'delayed';
export type DLQStatus = 'unresolved' | 'retrying' | 'resolved' | 'discarded';

export interface JobLogData {
  job_id: string;
  queue_name: string;
  job_type: string;
  user_id?: number | null;
  project_id?: number | null;
  scene_id?: number | null;
  status?: JobStatus;
  data?: any;
  max_attempts?: number;
  priority?: number;
  webhook_url?: string;
  estimated_duration_sec?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface JobLogUpdate {
  status?: JobStatus;
  progress?: number;
  error?: string;
  error_stack?: string;
  result?: any;
  attempts?: number;
  started_at?: string;
  completed_at?: string;
  actual_duration_sec?: number;
  webhook_last_sent?: string;
  metadata?: Record<string, any>;
}

export interface JobLog {
  id: number;
  job_id: string;
  queue_name: string;
  job_type: string;
  user_id: number | null;
  project_id: number | null;
  scene_id: number | null;
  status: JobStatus;
  progress: number;
  attempts: number;
  max_attempts: number;
  data: any;
  result: any;
  error: string | null;
  error_stack: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_duration_sec: number | null;
  actual_duration_sec: number | null;
  webhook_url: string | null;
  webhook_last_sent: string | null;
  priority: number;
  tags: string[] | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface JobListFilters {
  userId?: number;
  projectId?: number;
  sceneId?: number;
  queueName?: string;
  status?: JobStatus;
  jobType?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
}

export interface DeadLetterEntry {
  id: number;
  job_id: string;
  queue_name: string;
  job_type: string;
  user_id: number | null;
  project_id: number | null;
  original_data: any;
  error: string;
  error_stack: string | null;
  attempts_made: number;
  failed_at: string;
  status: DLQStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface DLQListFilters {
  userId?: number;
  projectId?: number;
  queueName?: string;
  status?: DLQStatus;
  limit?: number;
  offset?: number;
}

export interface QueueHealthSnapshot {
  id: number;
  queue_name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  worker_count: number;
  avg_completion_ms: number | null;
  snapshot_at: string;
}

// ─── CRUD Operations ──────────────────────────────────────────────────────

/**
 * Create a new job tracking entry when a BullMQ job is queued.
 */
export async function createJobLog(data: JobLogData): Promise<JobLog> {
  const result = await pool.query(
    `INSERT INTO job_tracking (
      job_id, queue_name, job_type, user_id, project_id, scene_id,
      status, data, max_attempts, priority, webhook_url,
      estimated_duration_sec, tags, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (job_id) DO UPDATE SET
      status = EXCLUDED.status,
      data = EXCLUDED.data,
      updated_at = NOW()
    RETURNING *`,
    [
      data.job_id,
      data.queue_name,
      data.job_type,
      data.user_id || null,
      data.project_id || null,
      data.scene_id || null,
      data.status || 'pending',
      JSON.stringify(data.data || {}),
      data.max_attempts || 3,
      data.priority || 0,
      data.webhook_url || null,
      data.estimated_duration_sec || null,
      data.tags || null,
      JSON.stringify(data.metadata || {}),
    ]
  );
  return formatJobLog(result.rows[0]);
}

/**
 * Update an existing job's status, progress, result, etc.
 */
export async function updateJobStatus(jobId: string, updates: JobLogUpdate): Promise<JobLog | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.progress !== undefined) {
    setClauses.push(`progress = $${paramIndex++}`);
    values.push(updates.progress);
  }
  if (updates.error !== undefined) {
    setClauses.push(`error = $${paramIndex++}`);
    values.push(updates.error);
  }
  if (updates.error_stack !== undefined) {
    setClauses.push(`error_stack = $${paramIndex++}`);
    values.push(updates.error_stack);
  }
  if (updates.result !== undefined) {
    setClauses.push(`result = $${paramIndex++}`);
    values.push(JSON.stringify(updates.result));
  }
  if (updates.attempts !== undefined) {
    setClauses.push(`attempts = $${paramIndex++}`);
    values.push(updates.attempts);
  }
  if (updates.started_at !== undefined) {
    setClauses.push(`started_at = $${paramIndex++}`);
    values.push(updates.started_at);
  }
  if (updates.completed_at !== undefined) {
    setClauses.push(`completed_at = $${paramIndex++}`);
    values.push(updates.completed_at);
  }
  if (updates.actual_duration_sec !== undefined) {
    setClauses.push(`actual_duration_sec = $${paramIndex++}`);
    values.push(updates.actual_duration_sec);
  }
  if (updates.webhook_last_sent !== undefined) {
    setClauses.push(`webhook_last_sent = $${paramIndex++}`);
    values.push(updates.webhook_last_sent);
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = $${paramIndex++}`);
    values.push(JSON.stringify(updates.metadata));
  }

  if (setClauses.length === 0) return null;

  values.push(jobId);
  const query = `UPDATE job_tracking SET ${setClauses.join(', ')} WHERE job_id = $${paramIndex} RETURNING *`;
  const result = await pool.query(query, values);

  if (result.rows.length === 0) return null;
  return formatJobLog(result.rows[0]);
}

/**
 * Get a single job by its BullMQ job ID.
 */
export async function getJobByJobId(jobId: string): Promise<JobLog | null> {
  const result = await pool.query(
    'SELECT * FROM job_tracking WHERE job_id = $1',
    [jobId]
  );
  if (result.rows.length === 0) return null;
  return formatJobLog(result.rows[0]);
}

/**
 * List jobs with flexible filtering, pagination, and sorting.
 */
export async function listJobs(filters: JobListFilters = {}): Promise<{ jobs: JobLog[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (filters.userId !== undefined) {
    conditions.push(`user_id = $${paramIndex++}`);
    values.push(filters.userId);
  }
  if (filters.projectId !== undefined) {
    conditions.push(`project_id = $${paramIndex++}`);
    values.push(filters.projectId);
  }
  if (filters.sceneId !== undefined) {
    conditions.push(`scene_id = $${paramIndex++}`);
    values.push(filters.sceneId);
  }
  if (filters.queueName) {
    conditions.push(`queue_name = $${paramIndex++}`);
    values.push(filters.queueName);
  }
  if (filters.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters.jobType) {
    conditions.push(`job_type = $${paramIndex++}`);
    values.push(filters.jobType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = filters.orderBy || 'created_at DESC';
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  // Count total
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM job_tracking ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch page
  const queryValues = [...values, limit, offset];
  const result = await pool.query(
    `SELECT * FROM job_tracking ${where} ORDER BY ${orderBy} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    queryValues
  );

  return {
    jobs: result.rows.map(formatJobLog),
    total,
  };
}

/**
 * Get job statistics for a user (counts by status).
 */
export async function getJobStats(userId?: number): Promise<Record<string, number>> {
  let query = 'SELECT status, COUNT(*) as count FROM job_tracking';
  const values: any[] = [];

  if (userId) {
    query += ' WHERE user_id = $1';
    values.push(userId);
  }

  query += ' GROUP BY status';
  const result = await pool.query(query, values);

  const stats: Record<string, number> = {
    pending: 0, active: 0, completed: 0, failed: 0, cancelled: 0, delayed: 0,
  };

  for (const row of result.rows) {
    stats[row.status] = parseInt(row.count, 10);
  }

  return stats;
}

/**
 * Get queue stats (counts + avg duration) for all queues.
 */
export async function getQueueStats(): Promise<any[]> {
  const result = await pool.query(
    `SELECT
      queue_name,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'delayed') as delayed,
      AVG(actual_duration_sec) FILTER (WHERE status = 'completed') as avg_duration_sec,
      AVG(attempts) FILTER (WHERE status = 'failed') as avg_attempts_failed
    FROM job_tracking
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY queue_name
    ORDER BY queue_name`
  );
  return result.rows;
}

// ─── Status Logging ───────────────────────────────────────────────────────

/**
 * Record a job status change in the audit log.
 */
export async function createStatusLog(
  jobTrackingId: number,
  jobId: string,
  previousStatus: string | null,
  newStatus: string,
  message?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO job_status_log (job_tracking_id, job_id, previous_status, new_status, message)
     VALUES ($1, $2, $3, $4, $5)`,
    [jobTrackingId, jobId, previousStatus, newStatus, message || null]
  );
}

// ─── Dead Letter Queue ────────────────────────────────────────────────────

/**
 * Move a failed job to the dead letter queue after exhausting retries.
 */
export async function moveToDeadLetter(
  jobId: string,
  queueName: string,
  jobType: string,
  userId: number | null,
  projectId: number | null,
  error: string,
  errorStack: string | null,
  attemptsMade: number,
  originalData: any
): Promise<DeadLetterEntry> {
  const result = await pool.query(
    `INSERT INTO dead_letter_queue (
      job_id, queue_name, job_type, user_id, project_id,
      original_data, error, error_stack, attempts_made
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      jobId,
      queueName,
      jobType,
      userId,
      projectId,
      JSON.stringify(originalData),
      error,
      errorStack || null,
      attemptsMade,
    ]
  );
  return formatDLQEntry(result.rows[0]);
}

/**
 * List dead letter queue entries with filters.
 */
export async function listDeadLetters(filters: DLQListFilters = {}): Promise<{ entries: DeadLetterEntry[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (filters.userId !== undefined) {
    conditions.push(`user_id = $${paramIndex++}`);
    values.push(filters.userId);
  }
  if (filters.projectId !== undefined) {
    conditions.push(`project_id = $${paramIndex++}`);
    values.push(filters.projectId);
  }
  if (filters.queueName) {
    conditions.push(`queue_name = $${paramIndex++}`);
    values.push(filters.queueName);
  }
  if (filters.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM dead_letter_queue ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT * FROM dead_letter_queue ${where} ORDER BY failed_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, limit, offset]
  );

  return {
    entries: result.rows.map(formatDLQEntry),
    total,
  };
}

/**
 * Mark a dead letter entry as being retried.
 */
export async function retryDeadLetter(dlqId: number): Promise<DeadLetterEntry | null> {
  const result = await pool.query(
    `UPDATE dead_letter_queue SET status = 'retrying', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [dlqId]
  );
  if (result.rows.length === 0) return null;
  return formatDLQEntry(result.rows[0]);
}

/**
 * Resolve a dead letter entry (acknowledged, won't retry).
 */
export async function resolveDeadLetter(dlqId: number, notes?: string): Promise<DeadLetterEntry | null> {
  const result = await pool.query(
    `UPDATE dead_letter_queue SET
      status = 'resolved',
      resolution_notes = $1,
      resolved_at = NOW()
    WHERE id = $2
    RETURNING *`,
    [notes || null, dlqId]
  );
  if (result.rows.length === 0) return null;
  return formatDLQEntry(result.rows[0]);
}

/**
 * Discard a dead letter entry (ignore permanently).
 */
export async function discardDeadLetter(dlqId: number): Promise<DeadLetterEntry | null> {
  const result = await pool.query(
    `UPDATE dead_letter_queue SET status = 'discarded', resolved_at = NOW() WHERE id = $1 RETURNING *`,
    [dlqId]
  );
  if (result.rows.length === 0) return null;
  return formatDLQEntry(result.rows[0]);
}

// ─── Queue Health ─────────────────────────────────────────────────────────

/**
 * Get the latest health snapshot for a queue.
 */
export async function getQueueHealth(queueName?: string): Promise<QueueHealthSnapshot[]> {
  if (queueName) {
    const result = await pool.query(
      `SELECT * FROM queue_health_snapshots WHERE queue_name = $1 ORDER BY snapshot_at DESC LIMIT 1`,
      [queueName]
    );
    return result.rows.map(formatHealthSnapshot);
  }

  // Get latest snapshot for each queue
  const result = await pool.query(
    `SELECT DISTINCT ON (queue_name) *
     FROM queue_health_snapshots
     ORDER BY queue_name, snapshot_at DESC`
  );
  return result.rows.map(formatHealthSnapshot);
}

/**
 * Get historical health snapshots for a queue.
 */
export async function getQueueHealthHistory(
  queueName: string,
  hours: number = 24,
  limit: number = 100
): Promise<QueueHealthSnapshot[]> {
  const result = await pool.query(
    `SELECT * FROM queue_health_snapshots
     WHERE queue_name = $1 AND snapshot_at > NOW() - ($2 || ' hours')::INTERVAL
     ORDER BY snapshot_at DESC
     LIMIT $3`,
    [queueName, hours.toString(), limit]
  );
  return result.rows.map(formatHealthSnapshot);
}

/**
 * Save a health snapshot for a queue.
 */
export async function saveQueueHealth(
  queueName: string,
  stats: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: boolean;
    worker_count: number;
    avg_completion_ms?: number;
  }
): Promise<QueueHealthSnapshot> {
  const result = await pool.query(
    `INSERT INTO queue_health_snapshots (
      queue_name, waiting, active, completed, failed, delayed,
      paused, worker_count, avg_completion_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      queueName,
      stats.waiting,
      stats.active,
      stats.completed,
      stats.failed,
      stats.delayed,
      stats.paused,
      stats.worker_count,
      stats.avg_completion_ms || null,
    ]
  );
  return formatHealthSnapshot(result.rows[0]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatJobLog(row: any): JobLog {
  return {
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data || {},
    result: typeof row.result === 'string' ? JSON.parse(row.result) : row.result || {},
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
  };
}

function formatDLQEntry(row: any): DeadLetterEntry {
  return {
    ...row,
    original_data: typeof row.original_data === 'string' ? JSON.parse(row.original_data) : row.original_data || {},
  };
}

function formatHealthSnapshot(row: any): QueueHealthSnapshot {
  return row;
}
