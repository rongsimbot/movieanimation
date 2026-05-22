/**
 * videoPreview.ts - Phase 5 Video Preview Generation System
 * 
 * Generates low-resolution proxy videos, thumbnails, and contact sheets
 * for quick timeline previews without needing to load full-resolution clips.
 * 
 * Features:
 * - Low-res proxy generation (360p/480p) for fast timeline scrubbing
 * - Thumbnail image extraction at specified timestamps
 * - Multi-thumbnail contact sheets (grid of frames)
 * - Batch generation for all clips in a timeline/scene
 * - Progress tracking and error handling
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ─── Types ──────────────────────────────────────────────────────

export interface PreviewOptions {
  /** Output resolution for proxy video (default: '360p') */
  resolution?: '240p' | '360p' | '480p' | '720p';
  /** Video codec (default: libx264) */
  videoCodec?: string;
  /** CRF quality (0-51, lower = better, default: 30 for previews) */
  crf?: number;
  /** Max output bitrate (default: '500k') */
  maxBitrate?: string;
  /** Include audio in proxy (default: false - saves space) */
  includeAudio?: boolean;
}

export interface ThumbnailOptions {
  /** Timestamp in seconds to capture (default: middle of clip) */
  timestamp?: number;
  /** Output width in pixels (height auto-scaled, default: 320) */
  width?: number;
  /** Image format (default: 'jpg') */
  format?: 'jpg' | 'png' | 'webp';
  /** Quality (1-100, default: 80) */
  quality?: number;
}

export interface ContactSheetOptions {
  /** Number of columns in the grid (default: 5) */
  columns?: number;
  /** Number of rows in the grid (default: auto-calculated) */
  rows?: number;
  /** Width of each thumbnail cell (default: 160) */
  cellWidth?: number;
  /** Image format (default: 'jpg') */
  format?: 'jpg' | 'png';
  /** Quality (1-100, default: 80) */
  quality?: number;
  /** Timestamp interval between thumbnails in seconds (default: auto) */
  interval?: number;
}

export interface BatchPreviewOptions {
  /** Preview options for each clip */
  preview?: PreviewOptions;
  /** Also generate thumbnails */
  thumbnails?: boolean;
  /** Also generate contact sheets */
  contactSheet?: boolean;
  /** Thumbnail config */
  thumbnailOptions?: ThumbnailOptions;
  /** Contact sheet config */
  contactSheetOptions?: ContactSheetOptions;
}

export interface PreviewResult {
  /** Path to the generated preview/proxy video */
  previewPath: string;
  /** Path to the thumbnail image (if generated) */
  thumbnailPath?: string;
  /** Duration of the original clip */
  duration: number;
  /** Original resolution */
  sourceResolution: { width: number; height: number };
  /** Preview resolution */
  previewResolution: { width: number; height: number };
  /** File size in bytes */
  fileSize: number;
}

export interface BatchPreviewResult {
  /** Total clips processed */
  total: number;
  /** Number of successful previews */
  success: number;
  /** Number of failed previews */
  failed: number;
  /** Individual results keyed by clip path */
  results: Record<string, PreviewResult | null>;
}

// ─── Resolution Maps ────────────────────────────────────────────

const PREVIEW_RESOLUTIONS = {
  '240p': { width: 426, height: 240 },
  '360p': { width: 640, height: 360 },
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
};

// ─── Directory Helpers ──────────────────────────────────────────

const PREVIEW_DIR = process.env.PREVIEW_DIR || path.join(process.cwd(), 'previews');
const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || path.join(process.cwd(), 'thumbnails');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getPreviewPath(clipPath: string, resolution: string): string {
  const dir = path.join(PREVIEW_DIR, resolution);
  ensureDir(dir);
  const baseName = path.basename(clipPath, path.extname(clipPath));
  return path.join(dir, `${baseName}_${resolution}.mp4`);
}

function getThumbnailPath(clipPath: string, timestamp: number): string {
  ensureDir(THUMBNAIL_DIR);
  const baseName = path.basename(clipPath, path.extname(clipPath));
  return path.join(THUMBNAIL_DIR, `${baseName}_t${Math.round(timestamp)}.jpg`);
}

// ─── Probe Utilities ────────────────────────────────────────────

/**
 * Probe a video file for duration and resolution.
 */
export function probeClip(videoPath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(new Error(`Failed to probe clip: ${err.message}`));
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      
      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        hasAudio: !!audioStream,
      });
    });
  });
}

// ─── Preview Generation ─────────────────────────────────────────

/**
 * Generate a low-resolution proxy video for timeline scrubbing.
 * Creates a ~360p H.264 video at CRF 30 for fast loading.
 */
export function generateClipPreview(
  videoPath: string,
  outputPath?: string,
  options: PreviewOptions = {}
): Promise<PreviewResult> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(videoPath)) {
        return reject(new Error(`Clip not found: ${videoPath}`));
      }

      const {
        resolution = '360p',
        videoCodec = 'libx264',
        crf = 30,
        maxBitrate = '500k',
        includeAudio = false,
      } = options;

      const { width, height } = PREVIEW_RESOLUTIONS[resolution];
      const finalOutputPath = outputPath || getPreviewPath(videoPath, resolution);
      
      ensureDir(path.dirname(finalOutputPath));

      // Probe source for metadata
      let sourceRes = { width: 1920, height: 1080 };
      let duration = 0;
      try {
        const probe = await probeClip(videoPath);
        sourceRes = { width: probe.width, height: probe.height };
        duration = probe.duration;
      } catch {
        // Non-fatal: continue with defaults
      }

      const outputOpts: string[] = [
        '-preset', 'ultrafast',
        '-crf', String(crf),
        '-maxrate', maxBitrate,
        '-bufsize', '1M',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ];

      if (includeAudio) {
        outputOpts.push('-c:a', 'aac', '-b:a', '64k');
      } else {
        outputOpts.push('-an');
      }

      const command = ffmpeg(videoPath)
        .videoCodec(videoCodec)
        .size(`${width}x${height}`)
        .outputOptions(outputOpts)
        .output(finalOutputPath)
        .on('start', (cmd) => {
          console.log(`[VideoPreview] Generating ${resolution} proxy: ${path.basename(videoPath)}`);
        })
        .on('end', () => {
          const stats = fs.statSync(finalOutputPath);
          console.log(`[VideoPreview] ✅ Proxy ready: ${path.basename(finalOutputPath)} (${(stats.size / 1024).toFixed(0)}KB)`);
          
          resolve({
            previewPath: finalOutputPath,
            duration,
            sourceResolution: sourceRes,
            previewResolution: { width, height },
            fileSize: stats.size,
          });
        })
        .on('error', (err) => {
          console.error(`[VideoPreview] ❌ Proxy failed: ${err.message}`);
          reject(new Error(`Preview generation failed: ${err.message}`));
        })
        .run();
    } catch (err: any) {
      reject(err);
    }
  });
}

// ─── Thumbnail Generation ───────────────────────────────────────

/**
 * Extract a thumbnail frame from a video at a specific timestamp.
 * Uses FFmpeg's fast seeking for quick frame extraction.
 */
export function generateThumbnail(
  videoPath: string,
  outputPath?: string,
  options: ThumbnailOptions = {}
): Promise<{ thumbnailPath: string; timestamp: number; fileSize: number }> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(videoPath)) {
        return reject(new Error(`Clip not found: ${videoPath}`));
      }

      let { timestamp, width = 320, format = 'jpg', quality = 80 } = options;

      // If no timestamp specified, seek to middle of clip
      if (timestamp === undefined) {
        try {
          const probe = await probeClip(videoPath);
          timestamp = probe.duration / 2;
        } catch {
          timestamp = 0;
        }
      }

      const finalOutputPath = outputPath || getThumbnailPath(videoPath, timestamp);
      ensureDir(path.dirname(finalOutputPath));

      const command = ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .size(`?x${width}`) // Scale to width, maintain aspect ratio
        .outputOptions([
          '-q:v', String(Math.round((100 - quality) / 3)), // FFmpeg quality scale
          '-vframes', '1',
        ])
        .output(finalOutputPath)
        .on('start', () => {
          console.log(`[VideoPreview] 📸 Thumbnail @ ${timestamp.toFixed(1)}s: ${path.basename(videoPath)}`);
        })
        .on('end', () => {
          const stats = fs.statSync(finalOutputPath);
          console.log(`[VideoPreview] ✅ Thumbnail ready: ${path.basename(finalOutputPath)} (${(stats.size / 1024).toFixed(0)}KB)`);
          
          resolve({
            thumbnailPath: finalOutputPath,
            timestamp,
            fileSize: stats.size,
          });
        })
        .on('error', (err) => {
          console.error(`[VideoPreview] ❌ Thumbnail failed: ${err.message}`);
          reject(new Error(`Thumbnail generation failed: ${err.message}`));
        });

      if (format === 'png') {
        command.outputOptions(['-vcodec', 'png']);
      } else if (format === 'webp') {
        command.outputOptions(['-vcodec', 'libwebp', '-lossless', '0']);
      }

      command.run();
    } catch (err: any) {
      reject(err);
    }
  });
}

// ─── Contact Sheet Generation ───────────────────────────────────

/**
 * Generate a contact sheet (grid of thumbnail frames) from a video.
 * Uses FFmpeg's tile filter for efficient grid generation.
 */
export function generateContactSheet(
  videoPath: string,
  outputPath?: string,
  options: ContactSheetOptions = {}
): Promise<{ contactSheetPath: string; frameCount: number; fileSize: number }> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(videoPath)) {
        return reject(new Error(`Clip not found: ${videoPath}`));
      }

      const {
        columns = 5,
        rows,
        cellWidth = 160,
        format = 'jpg',
        quality = 80,
        interval,
      } = options;

      // Probe for duration to calculate intervals
      let duration = 5;
      try {
        const probe = await probeClip(videoPath);
        duration = probe.duration;
      } catch {
        // Default to 5s
      }

      const totalFrames = columns * (rows || 3);
      const actualRows = rows || 3;
      const frameInterval = interval || Math.max(duration / totalFrames, 0.5);

      const baseName = path.basename(videoPath, path.extname(videoPath));
      const finalOutputPath = outputPath || path.join(THUMBNAIL_DIR, `${baseName}_contact.jpg`);
      ensureDir(path.dirname(finalOutputPath));

      // Build select filter for evenly-spaced frames
      const selectExpr = Array.from({ length: totalFrames }, (_, i) => {
        const t = Math.min(i * frameInterval, duration - 0.1);
        return `eq(n\\,${Math.round(t * 24)})`; // Assume ~24fps
      }).join('+');

      const command = ffmpeg(videoPath)
        .outputOptions([
          '-vf', `select='${selectExpr}',scale=${cellWidth}:-1,tile=${columns}x${actualRows}:padding=4:color=black`,
          '-frames:v', '1',
          '-q:v', String(Math.round((100 - quality) / 3)),
          '-vsync', '0',
        ])
        .output(finalOutputPath)
        .on('start', () => {
          console.log(`[VideoPreview] 📋 Contact sheet: ${path.basename(videoPath)} (${totalFrames} frames)`);
        })
        .on('end', () => {
          const stats = fs.statSync(finalOutputPath);
          console.log(`[VideoPreview] ✅ Contact sheet ready: ${path.basename(finalOutputPath)} (${(stats.size / 1024).toFixed(0)}KB)`);
          
          resolve({
            contactSheetPath: finalOutputPath,
            frameCount: totalFrames,
            fileSize: stats.size,
          });
        })
        .on('error', (err) => {
          console.error(`[VideoPreview] ❌ Contact sheet failed: ${err.message}`);
          reject(new Error(`Contact sheet generation failed: ${err.message}`));
        });

      command.run();
    } catch (err: any) {
      reject(err);
    }
  });
}

// ─── Batch Preview Generation ───────────────────────────────────

/**
 * Generate previews for multiple clips in batch.
 * Processes clips sequentially to avoid FFmpeg memory overload.
 */
export async function batchGeneratePreviews(
  clipPaths: string[],
  options: BatchPreviewOptions = {},
  onProgress?: (current: number, total: number, clipPath: string) => void
): Promise<BatchPreviewResult> {
  const result: BatchPreviewResult = {
    total: clipPaths.length,
    success: 0,
    failed: 0,
    results: {},
  };

  for (let i = 0; i < clipPaths.length; i++) {
    const clipPath = clipPaths[i];
    
    if (onProgress) {
      onProgress(i + 1, clipPaths.length, clipPath);
    }

    try {
      const previewResult = await generateClipPreview(clipPath, undefined, options.preview);
      
      // Generate thumbnail if requested
      if (options.thumbnails) {
        try {
          const thumb = await generateThumbnail(clipPath, undefined, options.thumbnailOptions);
          previewResult.thumbnailPath = thumb.thumbnailPath;
        } catch (thumbErr: any) {
          console.warn(`[VideoPreview] Thumbnail failed for ${clipPath}: ${thumbErr.message}`);
        }
      }

      result.results[clipPath] = previewResult;
      result.success++;
    } catch (err: any) {
      console.error(`[VideoPreview] Preview failed for ${clipPath}: ${err.message}`);
      result.results[clipPath] = null;
      result.failed++;
    }
  }

  console.log(`[VideoPreview] Batch complete: ${result.success}/${result.total} success, ${result.failed} failed`);
  return result;
}

// ─── Utility: Quick frame extraction for timeline hover ─────────

/**
 * Extract a sequence of low-res frames from a clip for timeline hover preview.
 * Returns an array of base64-encoded JPEG frames.
 */
export function extractFrameStrip(
  videoPath: string,
  frameCount: number = 10,
  stripWidth: number = 120
): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!fs.existsSync(videoPath)) {
        return reject(new Error(`Clip not found: ${videoPath}`));
      }

      let duration = 5;
      try {
        const probe = await probeClip(videoPath);
        duration = probe.duration;
      } catch {}

      const interval = duration / (frameCount + 1);
      const frames: string[] = [];
      const tmpDir = path.join(THUMBNAIL_DIR, 'tmp');
      ensureDir(tmpDir);

      for (let i = 1; i <= frameCount; i++) {
        const t = interval * i;
        const tmpFile = path.join(tmpDir, `strip_${Date.now()}_${i}.jpg`);
        
        await new Promise<void>((res, rej) => {
          ffmpeg(videoPath)
            .seekInput(t)
            .frames(1)
            .size(`?x${stripWidth}`)
            .outputOptions(['-q:v', '5'])
            .output(tmpFile)
            .on('end', () => {
              try {
                const buf = fs.readFileSync(tmpFile);
                frames.push(`data:image/jpeg;base64,${buf.toString('base64')}`);
                fs.unlinkSync(tmpFile);
                res();
              } catch (e) {
                res(); // Skip failed frames
              }
            })
            .on('error', () => res())
            .run();
        });
      }

      resolve(frames);
    } catch (err: any) {
      reject(err);
    }
  });
}

// ─── Utility: Generate preview for a single clip with all options ──

/**
 * Full preview generation: proxy video + thumbnail + contact sheet.
 */
export async function generateFullPreview(
  videoPath: string,
  clipId?: number,
  options: {
    preview?: PreviewOptions;
    thumbnail?: ThumbnailOptions;
    contactSheet?: ContactSheetOptions;
  } = {}
): Promise<{
  previewPath: string;
  thumbnailPath: string;
  contactSheetPath?: string;
  duration: number;
}> {
  const preview = await generateClipPreview(videoPath, undefined, options.preview);
  const thumb = await generateThumbnail(videoPath, undefined, options.thumbnail);

  let contactSheetPath: string | undefined;
  if (options.contactSheet) {
    try {
      const sheet = await generateContactSheet(videoPath, undefined, options.contactSheet);
      contactSheetPath = sheet.contactSheetPath;
    } catch {
      // Contact sheet is optional
    }
  }

  return {
    previewPath: preview.previewPath,
    thumbnailPath: thumb.thumbnailPath,
    contactSheetPath,
    duration: preview.duration,
  };
}

export default {
  generateClipPreview,
  generateThumbnail,
  generateContactSheet,
  batchGeneratePreviews,
  extractFrameStrip,
  generateFullPreview,
  probeClip,
};
