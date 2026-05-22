/**
 * videoExport.ts - Final Rendering Engine (FFmpeg-based)
 * MovieAnimation Backend - Phase 8 Final Rendering & Export Pipeline
 *
 * Handles:
 * - Resolution normalization (720p, 1080p, 4K)
 * - Multi-format export (MP4, MOV, WebM)
 * - Video codec optimization per format
 * - Audio stream handling & mixing
 * - Progress tracking with callbacks
 * - Quality / compression presets
 * - Duration & metadata probing
 */

import { FfmpegCommand, ffprobe } from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';

// Set bundled FFmpeg path
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ─── Types ──────────────────────────────────────────────────────

export interface ExportOptions {
  inputPath: string;
  outputPath: string;
  resolution: '720p' | '1080p' | '4k';
  format: 'mp4' | 'mov' | 'webm';
  bitrate?: string;
  framerate?: number;
  includeAudio?: boolean;
  compressionLevel?: 'fast' | 'medium' | 'slow';  // encoding speed preset
  metadata?: Record<string, string>;               // custom metadata tags
  outputFilename?: string;
}

export interface ExportProgress {
  percent: number;
  fps: number;
  currentKbps: number;
  targetSize: number;
  timemark: string;
  stage: string;
}

export interface ExportResult {
  outputPath: string;
  outputFilename: string;
  outputSizeBytes: number;
  durationSeconds: number;
  resolution: string;
  format: string;
  ffmpegCommand: string;
}

export interface VideoProbeResult {
  width: number;
  height: number;
  duration: number;
  codec: string;
  bitrate: number;
  hasAudio: boolean;
  fps: number;
}

// ─── Resolution presets ─────────────────────────────────────────

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  '720p':  { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k':    { width: 3840, height: 2160 },
};

const FORMAT_CODECS: Record<string, { video: string; audio: string }> = {
  'mp4':  { video: 'libx264',    audio: 'aac' },
  'mov':  { video: 'libx264',    audio: 'aac' },
  'webm': { video: 'libvpx-vp9', audio: 'libopus' },
};

const QUALITY_PRESETS: Record<string, { preset: string; crf: number }> = {
  'fast':   { preset: 'veryfast', crf: 28 },
  'medium': { preset: 'medium',   crf: 23 },
  'slow':   { preset: 'slow',     crf: 18 },
};

// ─── Video probing ──────────────────────────────────────────────

export function probeVideo(inputPath: string): Promise<VideoProbeResult> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) {
      return reject(new Error(`Input file not found: ${inputPath}`));
    }

    ffprobe(inputPath, (err: Error, metadata: any) => {
      if (err) return reject(new Error(`FFprobe failed: ${err.message}`));

      const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s: any) => s.codec_type === 'audio');

      if (!videoStream) return reject(new Error('No video stream found in input'));

      resolve({
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        duration: parseFloat(metadata.format?.duration || '0'),
        codec: videoStream.codec_name || 'unknown',
        bitrate: parseInt(metadata.format?.bit_rate || '0', 10),
        hasAudio: !!audioStream,
        fps: eval(videoStream.r_frame_rate || '30'), // r_frame_rate is like "30000/1001"
      });
    });
  });
}

// ─── Export engine ──────────────────────────────────────────────

export function exportVideo(
  options: ExportOptions,
  onProgress?: (progress: ExportProgress) => void,
  onStage?: (stage: string) => void
): Promise<ExportResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const {
        inputPath,
        outputPath,
        resolution,
        format,
        bitrate,
        framerate = 30,
        includeAudio = true,
        compressionLevel = 'medium',
        metadata = {},
        outputFilename,
      } = options;

      // Validate input
      if (!fs.existsSync(inputPath)) {
        return reject(new Error(`Input video file does not exist: ${inputPath}`));
      }

      const resConfig = RESOLUTION_MAP[resolution];
      const codecConfig = FORMAT_CODECS[format];
      const qualityConfig = QUALITY_PRESETS[compressionLevel];

      if (!resConfig || !codecConfig) {
        return reject(new Error(`Invalid resolution "${resolution}" or format "${format}"`));
      }

      // Ensure output directory exists
      const outDir = path.dirname(outputPath);
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      let ffmpegCommandLine = '';

      // Build FFmpeg command
      const command: FfmpegCommand = ffmpeg(inputPath);

      // ── Video scaling with aspect ratio preservation ──
      // Scale to target resolution, pad if needed to maintain aspect ratio
      const scaleFilter = `scale=${resConfig.width}:${resConfig.height}:force_original_aspect_ratio=decrease,pad=${resConfig.width}:${resConfig.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

      const videoFilters: string[] = [scaleFilter];

      // Apply framerate if specified and not default
      if (framerate && framerate !== 30) {
        videoFilters.push(`fps=${framerate}`);
      }

      // Set format and codec
      command.format(format);
      command.videoCodec(codecConfig.video);

      // Apply video filters
      command.videoFilters(videoFilters);

      // ── Video encoding options ──
      command.outputOptions([
        `-preset ${qualityConfig.preset}`,
        `-crf ${qualityConfig.crf}`,
        `-pix_fmt yuv420p`, // Ensure broad compatibility
      ]);

      // Bitrate mode (if specified, override CRF)
      if (bitrate) {
        command.outputOptions([
          `-b:v ${bitrate}`,
          `-maxrate ${bitrate}`,
          `-bufsize ${parseInt(bitrate) * 2}${bitrate.replace(/[0-9]/g, '')}`,
        ]);
      }

      // ── Audio handling ──
      if (includeAudio) {
        command.audioCodec(codecConfig.audio);
        if (format === 'mp4' || format === 'mov') {
          command.outputOptions([
            '-b:a 192k',     // AAC 192kbps
            '-ac 2',         // Stereo
          ]);
        } else if (format === 'webm') {
          command.outputOptions([
            '-b:a 128k',     // Opus 128kbps
          ]);
        }
      } else {
        command.noAudio();
      }

      // ── Metadata ──
      if (Object.keys(metadata).length > 0) {
        for (const [key, value] of Object.entries(metadata)) {
          command.outputOptions([`-metadata`, `${key}=${value}`]);
        }
      }

      // Default metadata
      command.outputOptions([
        `-metadata`, `encoded_by=MovieAnimation`,
        `-metadata`, `created_at=${new Date().toISOString()}`,
      ]);

      // Move moov atom to front for fast streaming (MP4/MOV)
      if (format === 'mp4' || format === 'mov') {
        command.outputOptions(['-movflags +faststart']);
      }

      // ── Event handlers ──
      command.on('start', (cmdLine: string) => {
        console.log(`[Export] FFmpeg started: ${cmdLine.substring(0, 200)}...`);
        ffmpegCommandLine = cmdLine;
        onStage?.('encoding');
      });

      command.on('progress', (progress: any) => {
        const pct = Math.min(Math.round(progress.percent || 0), 100);
        // ffmpeg percent can exceed 100 during muxing
        const clampedPct = Math.min(pct, 99);
        onProgress?.({
          percent: clampedPct,
          fps: progress.fps || 0,
          currentKbps: progress.currentKbps || 0,
          targetSize: progress.targetSize || 0,
          timemark: progress.timemark || '00:00:00',
          stage: 'encoding',
        });
      });

      command.on('end', () => {
        console.log(`[Export] Completed: ${outputPath}`);

        // Get final file stats
        let outputSize = 0;
        try {
          const stat = fs.statSync(outputPath);
          outputSize = stat.size;
        } catch {}

        // Probe for duration
        ffprobe(outputPath, (probeErr: Error, meta: any) => {
          const duration = probeErr ? 0 : parseFloat(meta.format?.duration || '0');

          resolve({
            outputPath,
            outputFilename: outputFilename || path.basename(outputPath),
            outputSizeBytes: outputSize,
            durationSeconds: duration,
            resolution,
            format,
            ffmpegCommand: ffmpegCommandLine,
          });
        });
      });

      command.on('error' as any, (stdoutOrErr: any, stderr?: string) => {
        const errorMsg = stdoutOrErr instanceof Error ? stdoutOrErr.message : (stderr || stdoutOrErr || 'Unknown FFmpeg error');
        console.error(`[Export] FFmpeg error: ${errorMsg}`);
        if (stderr && typeof stderr === 'string') {
          console.error(`[Export] FFmpeg stderr: ${stderr.substring(0, 500)}`);
        }
        reject(new Error(`FFmpeg export failed: ${errorMsg}`));
      });

      // Execute
      command.save(outputPath);
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Batch export: Multiple resolutions/formats from one source ──

export interface BatchExportItem {
  resolution: ExportOptions['resolution'];
  format: ExportOptions['format'];
  bitrate?: string;
  compressionLevel?: ExportOptions['compressionLevel'];
}

export interface BatchExportOptions {
  inputPath: string;
  outputDir: string;
  baseFilename: string;
  items: BatchExportItem[];
  onProgress?: (itemIndex: number, progress: ExportProgress) => void;
}

export async function batchExport(options: BatchExportOptions): Promise<ExportResult[]> {
  const results: ExportResult[] = [];
  const { inputPath, outputDir, baseFilename, items } = options;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const fmtConfig = FORMAT_CODECS[item.format];
    const ext = fmtConfig ? item.format : 'mp4';
    const outputFilename = `${baseFilename}_${item.resolution}.${ext}`;
    const outputPath = path.join(outputDir, outputFilename);

    const result = await exportVideo(
      {
        inputPath,
        outputPath,
        resolution: item.resolution,
        format: item.format,
        bitrate: item.bitrate,
        compressionLevel: item.compressionLevel || 'medium',
        outputFilename,
      },
      (progress) => options.onProgress?.(i, progress)
    );

    results.push(result);
  }

  return results;
}

// ─── Utility: Generate output path ──────────────────────────────

export function generateOutputPath(
  exportDir: string,
  exportId: number,
  name: string,
  resolution: string,
  format: string
): string {
  const ext = format || 'mp4';
  const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
  return path.join(exportDir, `${sanitizedName}_${resolution}_${exportId}.${ext}`);
}

// ─── Utility: Format file size ──────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ─── Utility: Format duration ──────────────────────────────────

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
