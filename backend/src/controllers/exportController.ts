/**
 * exportController.ts - Export & Share Link Route Handlers
 * MovieAnimation Backend - Phase 8 Final Rendering & Export Pipeline
 */

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as exportModel from '../models/exportModel';
import * as timelineModel from '../models/timelineModel';
import { exportVideo, probeVideo, generateOutputPath, formatFileSize, formatDuration } from '../services/videoExport';
import { addExportJob, getQueueStatus } from '../queue/exportQueue';
import { startExportCleanup } from '../queue/exportQueue';
import fs from 'fs';
import path from 'path';

// ─── Export directory ───────────────────────────────────────────

const EXPORT_DIR = process.env.EXPORT_DIR || path.join(process.cwd(), '..', 'exports');
const MAX_FILE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Ensure export directory exists on startup
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// Start cleanup job
startExportCleanup();

// ─── POST /api/exports — Start a new export ────────────────────

export const createExport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const {
      timeline_id,
      project_id,
      name,
      input_path,
      resolution = '1080p',
      format = 'mp4',
      bitrate,
      framerate = 30,
      compression_level = 'medium',
      expiration_hours,
    } = req.body;

    // Validate required fields
    if (!input_path) {
      return res.status(400).json({ error: 'input_path is required' });
    }

    // Validate input file exists
    if (!fs.existsSync(input_path)) {
      return res.status(400).json({ error: `Input file not found: ${input_path}` });
    }

    // Validate resolution
    if (!['720p', '1080p', '4k'].includes(resolution)) {
      return res.status(400).json({ error: 'Invalid resolution. Use: 720p, 1080p, or 4k' });
    }

    // Validate format
    if (!['mp4', 'mov', 'webm'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Use: mp4, mov, or webm' });
    }

    // Validate bitrate if provided
    if (bitrate && !/^\d+M$/.test(bitrate)) {
      return res.status(400).json({ error: 'Invalid bitrate format. Use e.g., "8M"' });
    }

    // Check if timeline has an assembled output
    if (timeline_id) {
      const timeline = await timelineModel.getTimelineById(timeline_id);
      if (!timeline) {
        return res.status(404).json({ error: 'Timeline not found' });
      }
      if (timeline.status !== 'completed') {
        return res.status(400).json({
          error: `Timeline assembly not complete. Current status: ${timeline.status}`,
        });
      }
      if (!timeline.output_path) {
        return res.status(400).json({ error: 'Timeline has no assembled output path' });
      }
    }

    // Probe input for duration
    let durationSeconds = 0;
    try {
      const probe = await probeVideo(input_path);
      durationSeconds = probe.duration;
    } catch {}

    // Create export record
    const exportRecord = await exportModel.createExport({
      user_id: userId,
      project_id,
      timeline_id,
      name: name || `Export_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`,
      input_path,
      resolution,
      format,
      bitrate,
      framerate,
      compression_level,
      expiration_hours: expiration_hours || 168, // 7 days default
    });

    // Generate output path
    const outputFilename = exportModel.generateOutputFilename(
      exportRecord.id,
      exportRecord.name,
      resolution,
      format
    );
    const outputPath = generateOutputPath(EXPORT_DIR, exportRecord.id, exportRecord.name, resolution, format);

    // Queue the export job
    const { jobId } = await addExportJob(userId, exportRecord.id, {
      inputPath: input_path,
      outputPath,
      resolution,
      format,
      bitrate,
      framerate,
      includeAudio: true,
      compressionLevel: compression_level,
      metadata: {
        title: exportRecord.name,
        project_id: String(project_id || ''),
        user_id: String(userId),
      },
      outputFilename,
    });

    res.status(201).json({
      message: 'Export job queued',
      export: {
        ...exportRecord,
        job_id: jobId,
        output_filename: outputFilename,
        output_duration_seconds: durationSeconds,
      },
      jobId,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/exports — List user's exports ────────────────────

export const listExports = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { limit = '20', offset = '0', timeline_id } = req.query;

    let exports: exportModel.ExportRecord[];

    if (timeline_id) {
      exports = await exportModel.getExportsByTimeline(parseInt(timeline_id as string, 10));
    } else {
      exports = await exportModel.getExportsByUser(
        userId,
        parseInt(limit as string, 10),
        parseInt(offset as string, 10)
      );
    }

    const stats = await exportModel.getExportStats(userId);

    // Format exports for API response
    const formatted = exports.map((exp) => ({
      id: exp.id,
      name: exp.name,
      resolution: exp.resolution,
      format: exp.format,
      status: exp.status,
      progress: exp.progress,
      duration: exp.output_duration_seconds || null,
      durationFormatted: exp.output_duration_seconds ? formatDuration(exp.output_duration_seconds) : null,
      fileSize: exp.output_size_bytes || null,
      fileSizeFormatted: exp.output_size_bytes ? formatFileSize(exp.output_size_bytes) : null,
      outputFilename: exp.output_filename,
      expiresAt: exp.expires_at,
      downloadCount: exp.download_count,
      createdAt: exp.created_at,
      completedAt: exp.completed_at,
      errorMessage: exp.error_message,
    }));

    res.json({ exports: formatted, stats });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/exports/:id — Get export details ─────────────────

export const getExport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid export ID' });

    const exportRecord = await exportModel.getExportById(id);
    if (!exportRecord) return res.status(404).json({ error: 'Export not found' });

    const logs = await exportModel.getExportLogs(id);
    const shareLinks = await exportModel.getShareLinksForExport(id);

    res.json({
      export: {
        ...exportRecord,
        durationFormatted: exportRecord.output_duration_seconds
          ? formatDuration(exportRecord.output_duration_seconds)
          : null,
        fileSizeFormatted: exportRecord.output_size_bytes
          ? formatFileSize(exportRecord.output_size_bytes)
          : null,
      },
      logs: logs.slice(0, 20), // Last 20 logs
      shareLinks: shareLinks.map((link) => ({
        id: link.id,
        urlToken: link.url_token,
        isActive: link.is_active,
        downloadCount: link.download_count,
        maxDownloads: link.max_downloads,
        hasPassword: !!link.password_hash,
        expiresAt: link.expires_at,
        createdAt: link.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/exports/:id/download — Download exported file ────

export const downloadExport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid export ID' });

    const exportRecord = await exportModel.getExportById(id);
    if (!exportRecord) return res.status(404).json({ error: 'Export not found' });
    if (exportRecord.status !== 'completed') {
      return res.status(400).json({
        error: `Export not ready. Status: ${exportRecord.status}`,
        progress: exportRecord.progress,
      });
    }
    if (!exportRecord.output_path || !fs.existsSync(exportRecord.output_path)) {
      return res.status(404).json({ error: 'Export file not found on disk (may have expired)' });
    }

    // Check expiry
    if (exportRecord.expires_at && new Date() > new Date(exportRecord.expires_at)) {
      return res.status(410).json({ error: 'Export has expired' });
    }

    // Increment download count
    await exportModel.incrementDownloadCount(id);

    const filename = exportRecord.output_filename || path.basename(exportRecord.output_path);
    const mimeType = exportModel.FORMAT_CONFIGS[exportRecord.format]?.mimeType || 'video/mp4';
    const fileSize = exportRecord.output_size_bytes || fs.statSync(exportRecord.output_path).size;

    // Set headers
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Stream the file
    const readStream = fs.createReadStream(exportRecord.output_path);
    readStream.pipe(res);
    readStream.on('error', (err) => {
      console.error(`[Download] Stream error for export #${id}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/exports/:id — Delete export ───────────────────

export const deleteExport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid export ID' });

    const exportRecord = await exportModel.getExportById(id);
    if (!exportRecord) return res.status(404).json({ error: 'Export not found' });

    // Only allow deleting own exports (unless admin)
    if (exportRecord.user_id !== req.user!.id) {
      return res.status(403).json({ error: 'You can only delete your own exports' });
    }

    // Delete file from disk
    if (exportRecord.output_path && fs.existsSync(exportRecord.output_path)) {
      fs.unlinkSync(exportRecord.output_path);
    }

    // Delete DB record (cascades to logs and share links)
    const deleted = await exportModel.updateExportStatus(id, { status: 'expired' });
    if (deleted) {
      // Hard delete after marking expired
      await pool.query('DELETE FROM exports WHERE id = $1', [id]);
    }

    res.json({ message: 'Export deleted' });
  } catch (err) {
    next(err);
  }
};

// Need pool for hard delete
import pool from '../config/database';

// ─── POST /api/exports/:id/share — Create a share link ─────────

export const createShareLink = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const exportId = parseInt(req.params.id, 10);
    if (isNaN(exportId)) return res.status(400).json({ error: 'Invalid export ID' });

    const exportRecord = await exportModel.getExportById(exportId);
    if (!exportRecord) return res.status(404).json({ error: 'Export not found' });
    if (exportRecord.status !== 'completed') {
      return res.status(400).json({ error: 'Cannot share an incomplete export' });
    }

    const { max_downloads, password, expiration_hours } = req.body;

    const shareLink = await exportModel.createShareLink(
      exportId,
      req.user!.id,
      {
        max_downloads: max_downloads || null,
        password: password || undefined,
        expiration_hours: expiration_hours || 72, // 3 days default
        created_by_ip: req.ip || req.socket.remoteAddress || undefined,
      }
    );

    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
    const shareUrl = `${FRONTEND_URL}/share/${shareLink.url_token}`;

    res.status(201).json({
      message: 'Share link created',
      shareUrl,
      share: {
        id: shareLink.id,
        urlToken: shareLink.url_token,
        expiresAt: shareLink.expires_at,
        maxDownloads: shareLink.max_downloads,
        hasPassword: !!password,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/exports/:id/shares — Get share links for export ──

export const getShareLinks = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const exportId = parseInt(req.params.id, 10);
    if (isNaN(exportId)) return res.status(400).json({ error: 'Invalid export ID' });

    const links = await exportModel.getShareLinksForExport(exportId);
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

    res.json({
      links: links.map((link) => ({
        id: link.id,
        shareUrl: `${FRONTEND_URL}/share/${link.url_token}`,
        urlToken: link.url_token,
        isActive: link.is_active,
        downloadCount: link.download_count,
        maxDownloads: link.max_downloads,
        hasPassword: !!link.password_hash,
        expiresAt: link.expires_at,
        createdAt: link.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/exports/:id/shares/:token — Revoke share link ─

export const revokeShareLink = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const exportId = parseInt(req.params.id, 10);
    if (isNaN(exportId)) return res.status(400).json({ error: 'Invalid export ID' });

    const exportRecord = await exportModel.getExportById(exportId);
    if (!exportRecord) return res.status(404).json({ error: 'Export not found' });

    const { token } = req.params;
    const deactivated = await exportModel.deactivateShareLink(token);
    if (!deactivated) return res.status(404).json({ error: 'Share link not found' });

    res.json({ message: 'Share link revoked' });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/share/:token — Public share access (returns metadata) ──

export const accessSharedExport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const validity = await exportModel.isShareLinkValid(token);

    if (!validity.valid) {
      return res.status(validity.reason?.includes('expired') ? 410 : 404).json({
        error: validity.reason,
        code: validity.reason?.includes('expired') ? 'EXPIRED' : 'INVALID',
      });
    }

    const share = validity.share!;
    const exportRecord = await exportModel.getExportById(share.export_id);

    if (!exportRecord || exportRecord.status !== 'completed') {
      return res.status(404).json({ error: 'Export no longer available' });
    }

    res.json({
      export: {
        id: exportRecord.id,
        name: exportRecord.name,
        resolution: exportRecord.resolution,
        format: exportRecord.format,
        durationFormatted: exportRecord.output_duration_seconds
          ? formatDuration(exportRecord.output_duration_seconds)
          : null,
        fileSizeFormatted: exportRecord.output_size_bytes
          ? formatFileSize(exportRecord.output_size_bytes)
          : null,
        createdAt: exportRecord.created_at,
      },
      share: {
        expiresAt: share.expires_at,
        downloadCount: share.download_count,
        maxDownloads: share.max_downloads,
        hasPassword: !!share.password_hash,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/share/:token/download — Public download via share ──

export const downloadSharedExport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const validity = await exportModel.isShareLinkValid(token);

    if (!validity.valid) {
      return res.status(validity.reason?.includes('expired') ? 410 : 404).json({
        error: validity.reason,
      });
    }

    const share = validity.share!;

    // Check password if required
    if (share.password_hash) {
      const { password } = req.query;
      if (!password || typeof password !== 'string') {
        return res.status(403).json({
          error: 'Password required',
          requiresPassword: true,
        });
      }

      const bcrypt = require('bcrypt');
      const match = await bcrypt.compare(password, share.password_hash);
      if (!match) {
        return res.status(403).json({ error: 'Invalid password' });
      }
    }

    const exportRecord = await exportModel.getExportById(share.export_id);
    if (!exportRecord || !exportRecord.output_path || !fs.existsSync(exportRecord.output_path)) {
      return res.status(404).json({ error: 'Export file not found' });
    }

    // Record access
    await exportModel.recordShareAccess(token);
    await exportModel.incrementDownloadCount(share.export_id);

    const filename = exportRecord.output_filename || path.basename(exportRecord.output_path);
    const mimeType = exportModel.FORMAT_CONFIGS[exportRecord.format]?.mimeType || 'video/mp4';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    fs.createReadStream(exportRecord.output_path).pipe(res);
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/exports/queue/status — Get queue status ──────────

export const getExportQueueStatus = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = await getQueueStatus();
    res.json({ queue: status });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/exports/resolutions — Available resolutions ──────

export const getResolutionOptions = async (_req: Request, res: Response) => {
  res.json({
    resolutions: Object.entries(exportModel.RESOLUTION_PRESETS).map(([key, val]) => ({
      id: key,
      label: val.label,
      width: val.width,
      height: val.height,
      defaultBitrate: val.defaultBitrate,
    })),
    formats: Object.entries(exportModel.FORMAT_CONFIGS).map(([key, val]) => ({
      id: key,
      extension: val.ext,
      mimeType: val.mimeType,
      videoCodec: val.videoCodec,
      audioCodec: val.audioCodec,
    })),
  });
};
