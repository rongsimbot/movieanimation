/**
 * exportModel.ts - Export & Share Link Database Operations
 * MovieAnimation Backend - Phase 8 Final Rendering & Export Pipeline
 */

import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// ─── Types ──────────────────────────────────────────────────────

export interface ExportRecord {
  id: number;
  user_id: number;
  project_id: number | null;
  timeline_id: number | null;
  name: string;
  input_path: string;
  output_path: string | null;
  output_filename: string | null;
  output_size_bytes: number | null;
  output_duration_seconds: number | null;
  resolution: '720p' | '1080p' | '4k';
  format: 'mp4' | 'mov' | 'webm';
  bitrate: string;
  framerate: number;
  include_audio: boolean;
  compression_level: string;
  metadata: Record<string, any>;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'expired';
  progress: number;
  job_id: string | null;
  error_message: string | null;
  ffmpeg_command: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  expires_at: Date | null;
  download_count: number;
}

export interface CreateExportInput {
  user_id: number;
  project_id?: number;
  timeline_id?: number;
  name?: string;
  input_path: string;
  resolution?: '720p' | '1080p' | '4k';
  format?: 'mp4' | 'mov' | 'webm';
  bitrate?: string;
  framerate?: number;
  compression_level?: string;
  expiration_hours?: number;
}

export interface ShareLink {
  id: number;
  export_id: number;
  user_id: number;
  token: string;
  url_token: string;
  is_active: boolean;
  max_downloads: number | null;
  download_count: number;
  password_hash: string | null;
  created_at: Date;
  expires_at: Date;
  last_accessed_at: Date | null;
  created_by_ip: string | null;
}

export interface ExportLog {
  id: number;
  export_id: number;
  job_id: string | null;
  status: string;
  progress: number;
  stage: string | null;
  message: string | null;
  duration_ms: number | null;
  created_at: Date;
}

// ─── Resolution presets ─────────────────────────────────────────

export const RESOLUTION_PRESETS: Record<string, { width: number; height: number; label: string; defaultBitrate: string }> = {
  '720p':  { width: 1280, height: 720,  label: 'HD 720p',  defaultBitrate: '5M' },
  '1080p': { width: 1920, height: 1080, label: 'Full HD 1080p', defaultBitrate: '8M' },
  '4k':    { width: 3840, height: 2160, label: '4K UHD 2160p', defaultBitrate: '20M' },
};

export const FORMAT_CONFIGS: Record<string, { ext: string; videoCodec: string; audioCodec: string; mimeType: string }> = {
  'mp4':  { ext: 'mp4',  videoCodec: 'libx264',    audioCodec: 'aac',     mimeType: 'video/mp4' },
  'mov':  { ext: 'mov',  videoCodec: 'libx264',    audioCodec: 'aac',     mimeType: 'video/quicktime' },
  'webm': { ext: 'webm', videoCodec: 'libvpx-vp9', audioCodec: 'libopus', mimeType: 'video/webm' },
};

// ─── Export CRUD ────────────────────────────────────────────────

export async function createExport(input: CreateExportInput): Promise<ExportRecord> {
  const defaultBitrate = RESOLUTION_PRESETS[input.resolution || '1080p'].defaultBitrate;
  const expiresAt = input.expiration_hours
    ? new Date(Date.now() + input.expiration_hours * 60 * 60 * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 7 days

  const result = await pool.query<ExportRecord>(
    `INSERT INTO exports (
      user_id, project_id, timeline_id, name, input_path,
      resolution, format, bitrate, framerate, compression_level,
      status, progress, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'queued', 0, $11)
    RETURNING *`,
    [
      input.user_id,
      input.project_id || null,
      input.timeline_id || null,
      input.name || `Export_${new Date().toISOString().replace(/[:.]/g, '-')}`,
      input.input_path,
      input.resolution || '1080p',
      input.format || 'mp4',
      input.bitrate || defaultBitrate,
      input.framerate || 30,
      input.compression_level || 'medium',
      expiresAt,
    ]
  );
  return result.rows[0];
}

export async function getExportById(id: number): Promise<ExportRecord | null> {
  const result = await pool.query<ExportRecord>(
    'SELECT * FROM exports WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getExportsByUser(userId: number, limit: number = 20, offset: number = 0): Promise<ExportRecord[]> {
  const result = await pool.query<ExportRecord>(
    `SELECT * FROM exports WHERE user_id = $1 
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

export async function getExportsByTimeline(timelineId: number): Promise<ExportRecord[]> {
  const result = await pool.query<ExportRecord>(
    'SELECT * FROM exports WHERE timeline_id = $1 ORDER BY created_at DESC',
    [timelineId]
  );
  return result.rows;
}

export async function updateExportStatus(
  id: number,
  updates: {
    status?: ExportRecord['status'];
    progress?: number;
    output_path?: string;
    output_filename?: string;
    output_size_bytes?: number;
    output_duration_seconds?: number;
    job_id?: string;
    error_message?: string | null;
    ffmpeg_command?: string;
    started_at?: Date;
    completed_at?: Date;
  }
): Promise<ExportRecord | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
  }

  if (fields.length === 0) return null;

  values.push(id);
  const result = await pool.query<ExportRecord>(
    `UPDATE exports SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function incrementDownloadCount(id: number): Promise<void> {
  await pool.query(
    'UPDATE exports SET download_count = download_count + 1 WHERE id = $1',
    [id]
  );
}

export async function expireOldExports(): Promise<number> {
  const result = await pool.query(
    `UPDATE exports SET status = 'expired' 
     WHERE status = 'completed' AND expires_at < NOW() AND status != 'expired'
     RETURNING id`
  );
  return result.rowCount || 0;
}

export async function getExportStats(userId: number): Promise<{
  total: number;
  completed: number;
  processing: number;
  failed: number;
  totalStorageBytes: number;
}> {
  const result = await pool.query(
    `SELECT
      COUNT(*)::int as total,
      COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as completed,
      COUNT(CASE WHEN status = 'processing' THEN 1 END)::int as processing,
      COUNT(CASE WHEN status = 'failed' THEN 1 END)::int as failed,
      COALESCE(SUM(CASE WHEN output_size_bytes IS NOT NULL THEN output_size_bytes ELSE 0 END), 0)::bigint as total_storage
     FROM exports WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  return {
    total: row.total,
    completed: row.completed,
    processing: row.processing,
    failed: row.failed,
    totalStorageBytes: parseInt(row.total_storage, 10),
  };
}

// ─── Export Logs ────────────────────────────────────────────────

export async function createExportLog(
  exportId: number,
  data: { job_id?: string; status?: string; progress?: number; stage?: string; message?: string; duration_ms?: number }
): Promise<ExportLog> {
  const result = await pool.query<ExportLog>(
    `INSERT INTO export_logs (export_id, job_id, status, progress, stage, message, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      exportId,
      data.job_id || null,
      data.status || 'processing',
      data.progress || 0,
      data.stage || null,
      data.message || null,
      data.duration_ms || null,
    ]
  );
  return result.rows[0];
}

export async function getExportLogs(exportId: number): Promise<ExportLog[]> {
  const result = await pool.query<ExportLog>(
    'SELECT * FROM export_logs WHERE export_id = $1 ORDER BY created_at DESC',
    [exportId]
  );
  return result.rows;
}

// ─── Share Links ────────────────────────────────────────────────

export async function createShareLink(
  exportId: number,
  userId: number,
  options: {
    max_downloads?: number;
    password?: string;
    expiration_hours?: number;
    created_by_ip?: string;
  } = {}
): Promise<ShareLink> {
  const token = crypto.randomBytes(32).toString('hex');
  const urlToken = Buffer.from(`${exportId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`)
    .toString('base64url')
    .substring(0, 64);

  const expiresAt = options.expiration_hours
    ? new Date(Date.now() + options.expiration_hours * 60 * 60 * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 7 days

  let passwordHash: string | null = null;
  if (options.password) {
    const bcrypt = require('bcrypt');
    passwordHash = await bcrypt.hash(options.password, 10);
  }

  const result = await pool.query<ShareLink>(
    `INSERT INTO share_links (
      export_id, user_id, token, url_token, max_downloads,
      password_hash, expires_at, created_by_ip
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      exportId,
      userId,
      token,
      urlToken,
      options.max_downloads || null,
      passwordHash,
      expiresAt,
      options.created_by_ip || null,
    ]
  );
  return result.rows[0];
}

export async function getShareLinkByToken(urlToken: string): Promise<ShareLink | null> {
  const result = await pool.query<ShareLink>(
    'SELECT * FROM share_links WHERE url_token = $1 AND is_active = true',
    [urlToken]
  );
  return result.rows[0] || null;
}

export async function getShareLinksForExport(exportId: number): Promise<ShareLink[]> {
  const result = await pool.query<ShareLink>(
    'SELECT * FROM share_links WHERE export_id = $1 ORDER BY created_at DESC',
    [exportId]
  );
  return result.rows;
}

export async function recordShareAccess(urlToken: string): Promise<void> {
  await pool.query(
    `UPDATE share_links 
     SET download_count = download_count + 1, last_accessed_at = NOW()
     WHERE url_token = $1`,
    [urlToken]
  );
}

export async function deactivateShareLink(token: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE share_links SET is_active = false WHERE url_token = $1 OR token = $1',
    [token]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function isShareLinkValid(urlToken: string): Promise<{ valid: boolean; reason?: string; share?: ShareLink }> {
  const share = await getShareLinkByToken(urlToken);
  if (!share) return { valid: false, reason: 'Link not found or inactive' };
  if (!share.is_active) return { valid: false, reason: 'Link has been deactivated', share };
  if (new Date() > new Date(share.expires_at)) return { valid: false, reason: 'Link has expired', share };
  if (share.max_downloads !== null && share.download_count >= share.max_downloads) {
    return { valid: false, reason: 'Download limit reached', share };
  }
  return { valid: true, share };
}

// ─── Cleanup ────────────────────────────────────────────────────

export async function cleanupExpiredExports(): Promise<{ exportsExpired: number; linksExpired: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Expire old exports
    const expResult = await client.query(
      `UPDATE exports SET status = 'expired'
       WHERE status = 'completed' AND expires_at < NOW()
       RETURNING id`
    );
    const exportsExpired = expResult.rowCount || 0;

    // Deactivate expired share links
    const linkResult = await client.query(
      `UPDATE share_links SET is_active = false
       WHERE is_active = true AND expires_at < NOW()
       RETURNING id`
    );
    const linksExpired = linkResult.rowCount || 0;

    await client.query('COMMIT');
    return { exportsExpired, linksExpired };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Resolution helpers ─────────────────────────────────────────

export function getResolutionConfig(
  resolution: string,
  format: string
): { width: number; height: number; videoCodec: string; audioCodec: string; ext: string; mimeType: string; defaultBitrate: string } | null {
  const resConfig = RESOLUTION_PRESETS[resolution];
  const fmtConfig = FORMAT_CONFIGS[format];
  if (!resConfig || !fmtConfig) return null;
  return { ...resConfig, ...fmtConfig };
}

export function generateOutputFilename(
  exportId: number,
  name: string,
  resolution: string,
  format: string
): string {
  const ext = FORMAT_CONFIGS[format]?.ext || format;
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
  return `${sanitized}_${resolution}_${exportId}.${ext}`;
}
