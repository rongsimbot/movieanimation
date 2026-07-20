/**
 * Phase 6: Sora Video Generation Service
 * Integration with OpenAI Sora 2 API for cinematic video generation.
 *
 * Supports:
 * - Text-to-Video: Generate from enhanced prompts
 * - Image-to-Video: Animate character reference images
 * - Status polling and webhook integration
 * - Cost tracking per generation
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SoraGenerationRequest {
  prompt: string;
  duration?: number;        // 4, 5, 8, or 10 seconds
  quality?: 'standard' | 'high';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  characterImageUrl?: string;
  negativePrompt?: string;
}

export interface SoraGenerationResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  error?: string;
  estimatedCost: number;
}

const SORA_SCRIPT_DIR = path.join(
  process.env.HOME || '/home/lo',
  '.openclaw/workspace/skills/sora-video-manager/scripts'
);

const API_COST_PER_SEC = {
  standard: 0.10,
  high: 0.20,
};

/**
 * Generate a video from a text prompt using Sora 2.
 */
export async function generateTextToVideo(
  request: SoraGenerationRequest
): Promise<SoraGenerationResponse> {
  const {
    prompt,
    duration = 5,
    quality = 'high',
    aspectRatio = '16:9',
  } = request;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  console.log(`🎬 [Sora] Generating text-to-video: ${prompt.slice(0, 80)}...`);

  try {
    // Use the Sora skill script if available, otherwise direct API call
    const scriptPath = path.join(SORA_SCRIPT_DIR, 'generate_text_to_video.sh');
    let videoId: string;

    if (fs.existsSync(scriptPath)) {
      // Using the bash script (more robust)
      const cmd = `bash "${scriptPath}" "${prompt.replace(/"/g, '\\"')}" ${duration} ${quality} ${aspectRatio}`;
      const { stdout, stderr } = await execAsync(cmd, {
        env: { ...process.env, OPENAI_API_KEY: openaiKey },
        timeout: 30000,
      });

      if (stderr && !stderr.includes('Warning')) {
        console.warn(`[Sora] Script stderr: ${stderr}`);
      }

      // Parse Video ID from output
      const idMatch = stdout.match(/Video ID:\s*(\S+)/);
      if (!idMatch) {
        // Fallback: direct API call
        return await directApiCall(request);
      }
      videoId = idMatch[1];
    } else {
      // Direct API call
      return await directApiCall(request);
    }

    const costPerSec = API_COST_PER_SEC[quality];
    const estimatedCost = duration * costPerSec;

    return {
      id: videoId,
      status: 'queued',
      estimatedCost: Math.round(estimatedCost * 10000) / 10000,
    };
  } catch (error: any) {
    console.error(`[Sora] Text-to-video generation error:`, error.message);
    throw categorizeError(error);
  }
}

/**
 * Generate a video from an image + text prompt.
 */
export async function generateImageToVideo(
  imagePath: string,
  prompt: string,
  duration: number = 5,
): Promise<SoraGenerationResponse> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  console.log(`🎬 [Sora] Generating image-to-video: ${imagePath} → ${prompt.slice(0, 60)}...`);

  try {
    const scriptPath = path.join(SORA_SCRIPT_DIR, 'generate_image_to_video.sh');

    if (fs.existsSync(scriptPath)) {
      const cmd = `bash "${scriptPath}" "${imagePath}" "${prompt.replace(/"/g, '\\"')}" ${duration}`;
      const { stdout } = await execAsync(cmd, {
        env: { ...process.env, OPENAI_API_KEY: openaiKey },
        timeout: 30000,
      });

      const idMatch = stdout.match(/Video ID:\s*(\S+)/);
      if (!idMatch) {
        return await directImageToVideoCall(imagePath, prompt, duration);
      }

      return {
        id: idMatch[1],
        status: 'queued',
        estimatedCost: Math.round(duration * API_COST_PER_SEC.high * 10000) / 10000,
      };
    } else {
      return await directImageToVideoCall(imagePath, prompt, duration);
    }
  } catch (error: any) {
    console.error(`[Sora] Image-to-video generation error:`, error.message);
    throw categorizeError(error);
  }
}

/**
 * Check the status of a Sora video generation.
 */
export async function checkStatus(videoId: string): Promise<SoraGenerationResponse> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  try {
    const scriptPath = path.join(SORA_SCRIPT_DIR, 'check_status.sh');

    if (fs.existsSync(scriptPath)) {
      const cmd = `bash "${scriptPath}" "${videoId}"`;
      const { stdout } = await execAsync(cmd, {
        env: { ...process.env, OPENAI_API_KEY: openaiKey },
        timeout: 15000,
      });

      return parseStatusOutput(stdout, videoId);
    } else {
      // Direct API call
      return await directStatusCheck(videoId);
    }
  } catch (error: any) {
    console.error(`[Sora] Status check error:`, error.message);
    throw categorizeError(error);
  }
}

/**
 * Download a completed video.
 */
export async function downloadVideo(videoId: string, outputPath: string): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY environment variable not set');
  }

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const scriptPath = path.join(SORA_SCRIPT_DIR, 'download_video.sh');

    if (fs.existsSync(scriptPath)) {
      const cmd = `bash "${scriptPath}" "${videoId}" "${outputPath}"`;
      await execAsync(cmd, {
        env: { ...process.env, OPENAI_API_KEY: openaiKey },
        timeout: 120000,
      });
    } else {
      // Direct download
      const status = await directStatusCheck(videoId);
      if (status.status !== 'completed' || !status.videoUrl) {
        throw new Error(`Video not ready. Status: ${status.status}`);
      }
      await downloadFile(status.videoUrl, outputPath);
    }

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`✅ [Sora] Downloaded ${videoId} → ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
      return outputPath;
    }

    throw new Error(`Download failed: file not found at ${outputPath}`);
  } catch (error: any) {
    console.error(`[Sora] Download error:`, error.message);
    throw categorizeError(error);
  }
}

// ─── Direct API Calls (Fallback when scripts unavailable) ─────────────────

async function directApiCall(request: SoraGenerationRequest): Promise<SoraGenerationResponse> {
  const response = await fetch('https://api.openai.com/v1/videos/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sora-2',
      prompt: request.prompt,
      duration: request.duration || 5,
      quality: request.quality || 'high',
      aspect_ratio: request.aspectRatio || '16:9',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const costPerSec = API_COST_PER_SEC[request.quality || 'high'];
  return {
    id: data.id,
    status: data.status || 'queued',
    estimatedCost: Math.round((request.duration || 5) * costPerSec * 10000) / 10000,
  };
}

async function directImageToVideoCall(
  imagePath: string,
  prompt: string,
  duration: number
): Promise<SoraGenerationResponse> {
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const mimeType = getMimeType(imagePath);

  const response = await fetch('https://api.openai.com/v1/videos/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sora-2',
      prompt,
      image: `data:${mimeType};base64,${imageBase64}`,
      duration,
      mode: 'image-to-video',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(err.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    status: data.status || 'queued',
    estimatedCost: Math.round(duration * API_COST_PER_SEC.high * 10000) / 10000,
  };
}

async function directStatusCheck(videoId: string): Promise<SoraGenerationResponse> {
  const response = await fetch(`https://api.openai.com/v1/videos/generations/${videoId}`, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Status check failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const costPerSec = API_COST_PER_SEC.high;
  const duration = 5; // default

  return {
    id: data.id,
    status: data.status,
    progress: data.progress,
    videoUrl: data.video_url,
    thumbnailUrl: data.thumbnail_url,
    durationSeconds: data.duration,
    error: data.error?.message,
    estimatedCost: Math.round(duration * costPerSec * 10000) / 10000,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseStatusOutput(stdout: string, videoId: string): SoraGenerationResponse {
  const statusMatch = stdout.match(/Status:\s*(\S+)/);
  const status = (statusMatch?.[1] || 'unknown') as SoraGenerationResponse['status'];

  const progressMatch = stdout.match(/Progress:\s*(\d+)/);
  const progress = progressMatch ? parseInt(progressMatch[1], 10) : 0;

  const urlMatch = stdout.match(/Download URL:\s*(\S+)/);
  const videoUrl = urlMatch?.[1];

  const errorMatch = stdout.match(/failed:\s*(.+)/);
  const error = errorMatch?.[1];

  const costPerSec = API_COST_PER_SEC.high;
  const duration = 5;

  return {
    id: videoId,
    status,
    progress,
    videoUrl,
    thumbnailUrl: videoUrl ? videoUrl.replace(/\.mp4$/, '_thumb.jpg') : undefined,
    error,
    estimatedCost: Math.round(duration * costPerSec * 10000) / 10000,
  };
}

function categorizeError(error: any): Error {
  const message = error.message || String(error);
  const enriched = new Error(message);

  if (message.includes('429') || message.includes('rate')) {
    (enriched as any).category = 'rate_limit';
  } else if (message.includes('content') || message.includes('policy') || message.includes('safety')) {
    (enriched as any).category = 'content_policy';
  } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    (enriched as any).category = 'timeout';
  } else if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
    (enriched as any).category = 'auth_error';
  } else {
    (enriched as any).category = 'api_error';
  }

  return enriched;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };
  return mimeTypes[ext] || 'image/jpeg';
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

export default {
  generateTextToVideo,
  generateImageToVideo,
  checkStatus,
  downloadVideo,
};
