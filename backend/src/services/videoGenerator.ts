/**
 * videoGenerator.ts - Multi-API Video Generation Service
 * Integrates Sora, Runway, Seedance APIs with retry logic and cost tracking
 */

import axios, { AxiosError } from 'axios';
import { trackCost, CostEntry } from './costTracker';

// ---- Types ----

export interface VideoGenRequest {
  prompt: string;
  apiName: 'sora' | 'runway' | 'seedance' | 'luma';
  duration?: number;
  aspectRatio?: string;
  quality?: 'standard' | 'high';
  imageUrl?: string;
  userId?: string;
  projectId?: string;
  sceneId?: string;
}

export interface VideoGenResponse {
  videoUrl: string;
  generationId: string;
  apiUsed: string;
  cost: number;
  duration: number;
  thumbnailUrl?: string;
}

export interface GenerationStatus {
  id: string;
  state: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  videoUrl?: string;
  error?: string;
}

// ---- Retry Configuration ----

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Exponential backoff with jitter
 */
function getRetryDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Generic retry wrapper for API calls
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  errorClassifier?: (error: any) => 'retryable' | 'fatal'
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Classify the error
      const classification = errorClassifier ? errorClassifier(error) : classifyError(error);

      if (classification === 'fatal' || attempt === config.maxAttempts - 1) {
        throw error;
      }

      // Rate limited? Use Retry-After header if available
      let delay = getRetryDelay(attempt, config);
      if (error.response?.status === 429) {
        const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '0', 10);
        if (retryAfter > 0) delay = retryAfter * 1000;
      }

      console.log(`[Retry] Attempt ${attempt + 1}/${config.maxAttempts} failed. Retrying in ${delay}ms...`);
      console.log(`[Retry] Error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Classify API errors as retryable or fatal
 */
function classifyError(error: any): 'retryable' | 'fatal' {
  if (!error.response) return 'retryable'; // Network errors

  const status = error.response.status;

  // Retryable: rate limits, server errors, timeouts
  if (status === 429 || status >= 500 || status === 408) return 'retryable';

  // Fatal: auth errors, bad requests (content policy), not found
  if (status === 401 || status === 403 || status === 400 || status === 404) return 'fatal';

  return 'retryable';
}

// ---- OpenAI Sora Integration ----

const SORA_API_KEY = process.env.OPENAI_API_KEY || '';
const SORA_BASE_URL = 'https://api.openai.com/v1/videos';

/**
 * Generate video using OpenAI Sora API
 */
export async function generateVideoSora(request: VideoGenRequest): Promise<VideoGenResponse> {
  console.log(`[Sora] Generating video with prompt: "${request.prompt.substring(0, 80)}..."`);

  return withRetry(async () => {
    const payload: any = {
      model: 'sora-2',
      prompt: request.prompt,
      duration: request.duration || 5,
      aspect_ratio: request.aspectRatio || '16:9',
      quality: request.quality || 'high',
    };

    if (request.imageUrl) {
      payload.image_url = request.imageUrl;
    }

    const response = await axios.post(
      `${SORA_BASE_URL}/generations`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${SORA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const generationId = response.data.id;
    console.log(`[Sora] Generation started: ${generationId}`);

    // Poll for completion
    const videoUrl = await pollSoraGeneration(generationId);

    // Calculate cost
    const costPerSecond = request.quality === 'high' ? 0.20 : 0.10;
    const cost = (request.duration || 5) * costPerSecond;

    // Track cost
    trackCost({
      apiName: 'sora',
      userId: request.userId,
      projectId: request.projectId,
      sceneId: request.sceneId,
      creditsUsed: cost,
      generationId,
      prompt: request.prompt,
    });

    return {
      videoUrl,
      generationId,
      apiUsed: 'sora',
      cost,
      duration: request.duration || 5,
    };
  }, DEFAULT_RETRY_CONFIG, classifyError);
}

async function pollSoraGeneration(generationId: string, maxAttempts = 30): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10000));

    const statusRes = await axios.get(
      `${SORA_BASE_URL}/generations/${generationId}`,
      { headers: { 'Authorization': `Bearer ${SORA_API_KEY}` } }
    );

    const state = statusRes.data.status || statusRes.data.state;

    if (state === 'completed' || state === 'succeeded') {
      const videoUrl = statusRes.data.video_url || statusRes.data.assets?.video;
      if (!videoUrl) throw new Error('Sora generation completed but no video URL returned');
      console.log(`[Sora] Generation ${generationId} completed`);
      return videoUrl;
    }

    if (state === 'failed') {
      throw new Error(`Sora generation failed: ${statusRes.data.failure_reason || 'Unknown error'}`);
    }

    console.log(`[Sora] Polling ${generationId} - attempt ${attempt + 1}/${maxAttempts} - state: ${state}`);
  }

  throw new Error('Sora generation timed out after 5 minutes');
}

// ---- Runway Gen-4.5 Integration ----

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY || '';
const RUNWAY_BASE_URL = 'https://api.dev.runwayml.com/v1';

/**
 * Generate video using Runway Gen-4.5 API
 * NOTE: Runway requires image-to-video (imageUrl must be provided or generated first)
 */
export async function generateVideoRunway(request: VideoGenRequest): Promise<VideoGenResponse> {
  console.log(`[Runway] Generating video with prompt: "${request.prompt.substring(0, 80)}..."`);

  return withRetry(async () => {
    // Runway Gen-4.5 uses image-to-video primarily
    if (!request.imageUrl) {
      console.warn('[Runway] No imageUrl provided - Runway works best with image-to-video. Using text-only mode.');
    }

    const payload: any = {
      model: 'gen4.5',
      promptText: request.prompt,
      ratio: '1280:720',
      duration: request.duration || 5,
      generateAudio: false,
    };

    if (request.imageUrl) {
      payload.imageUrl = request.imageUrl;
    }

    const response = await axios.post(
      `${RUNWAY_BASE_URL}/text_to_video`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${RUNWAY_API_KEY}`,
          'X-Runway-Version': '2024-11-06',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const taskId = response.data.id;
    console.log(`[Runway] Task started: ${taskId}`);

    const videoUrl = await pollRunwayTask(taskId);

    // Cost estimation (Runway: ~$0.05/second)
    const costPerSecond = 0.05;
    const cost = (request.duration || 5) * costPerSecond;

    trackCost({
      apiName: 'runway',
      userId: request.userId,
      projectId: request.projectId,
      sceneId: request.sceneId,
      creditsUsed: cost,
      generationId: taskId,
      prompt: request.prompt,
    });

    return {
      videoUrl,
      generationId: taskId,
      apiUsed: 'runway',
      cost,
      duration: request.duration || 5,
    };
  }, DEFAULT_RETRY_CONFIG, classifyError);
}

async function pollRunwayTask(taskId: string, maxAttempts = 30): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10000));

    const statusRes = await axios.get(
      `${RUNWAY_BASE_URL}/tasks/${taskId}`,
      {
        headers: {
          'Authorization': `Bearer ${RUNWAY_API_KEY}`,
          'X-Runway-Version': '2024-11-06',
        },
      }
    );

    const status = statusRes.data.status;

    if (status === 'SUCCEEDED') {
      const videoUrl = statusRes.data.output?.[0];
      if (!videoUrl) throw new Error('Runway task succeeded but no output URL returned');
      console.log(`[Runway] Task ${taskId} completed`);
      return videoUrl;
    }

    if (status === 'FAILED') {
      throw new Error(`Runway generation failed for task ${taskId}`);
    }

    console.log(`[Runway] Polling ${taskId} - attempt ${attempt + 1}/${maxAttempts} - status: ${status}`);
  }

  throw new Error('Runway generation timed out after 5 minutes');
}

// ---- Seedance 2.0 Integration ----

const SEEDANCE_API_KEY = process.env.SEEDANCE_API_KEY || '';
const SEEDANCE_BASE_URL = 'https://api.seedance.io/v1';

/**
 * Generate video using Seedance 2.0 API
 * Best for volume/social clips, fastest generation
 */
export async function generateVideoSeedance(request: VideoGenRequest): Promise<VideoGenResponse> {
  console.log(`[Seedance] Generating video with prompt: "${request.prompt.substring(0, 80)}..."`);

  return withRetry(async () => {
    const payload: any = {
      text_prompt: request.prompt,
      duration: Math.min(request.duration || 3, 5), // Seedance max is 5 seconds
      aspect_ratio: request.aspectRatio || '16:9',
    };

    if (request.imageUrl) {
      payload.image_input = request.imageUrl;
    }

    const response = await axios.post(
      `${SEEDANCE_BASE_URL}/generate`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${SEEDANCE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const generationId = response.data.generation_id || response.data.id;
    console.log(`[Seedance] Generation started: ${generationId}`);

    const videoUrl = await pollSeedanceGeneration(generationId);

    // Cost estimation (Seedance: ~$0.02/second - cheapest)
    const costPerSecond = 0.02;
    const cost = Math.min(request.duration || 3, 5) * costPerSecond;

    trackCost({
      apiName: 'seedance',
      userId: request.userId,
      projectId: request.projectId,
      sceneId: request.sceneId,
      creditsUsed: cost,
      generationId,
      prompt: request.prompt,
    });

    return {
      videoUrl,
      generationId,
      apiUsed: 'seedance',
      cost,
      duration: Math.min(request.duration || 3, 5),
    };
  }, DEFAULT_RETRY_CONFIG, classifyError);
}

async function pollSeedanceGeneration(generationId: string, maxAttempts = 30): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10000));

    const statusRes = await axios.get(
      `${SEEDANCE_BASE_URL}/status/${generationId}`,
      { headers: { 'Authorization': `Bearer ${SEEDANCE_API_KEY}` } }
    );

    const state = statusRes.data.status || statusRes.data.state;

    if (state === 'completed' || state === 'done') {
      const videoUrl = statusRes.data.video_url || statusRes.data.output_url;
      if (!videoUrl) throw new Error('Seedance generation completed but no video URL returned');
      console.log(`[Seedance] Generation ${generationId} completed`);
      return videoUrl;
    }

    if (state === 'failed' || state === 'error') {
      throw new Error(`Seedance generation failed: ${statusRes.data.error || 'Unknown error'}`);
    }

    console.log(`[Seedance] Polling ${generationId} - attempt ${attempt + 1}/${maxAttempts} - state: ${state}`);
  }

  throw new Error('Seedance generation timed out after 5 minutes');
}

// ---- Luma Dream Machine (legacy, kept for backward compat) ----

const LUMA_API_KEY = process.env.LUMA_API_KEY || '';

export async function generateVideoLuma(request: VideoGenRequest): Promise<VideoGenResponse> {
  console.log(`[Luma] Generating video with prompt: "${request.prompt.substring(0, 80)}..."`);

  return withRetry(async () => {
    const response = await axios.post(
      'https://api.lumalabs.ai/dream-machine/v1/generations',
      {
        prompt: request.prompt,
        aspect_ratio: request.aspectRatio || '16:9',
      },
      {
        headers: {
          'Authorization': `Bearer ${LUMA_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const generationId = response.data.id;
    console.log(`[Luma] Generation started: ${generationId}`);

    let videoUrl: string | null = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      const statusRes = await axios.get(
        `https://api.lumalabs.ai/dream-machine/v1/generations/${generationId}`,
        { headers: { 'Authorization': `Bearer ${LUMA_API_KEY}` } }
      );
      if (statusRes.data.state === 'completed') {
        videoUrl = statusRes.data.assets?.video;
        break;
      } else if (statusRes.data.state === 'failed') {
        throw new Error(`Luma generation failed: ${statusRes.data.failure_reason}`);
      }
    }

    if (!videoUrl) throw new Error('Luma generation timed out');

    const cost = (request.duration || 5) * 0.03;

    trackCost({
      apiName: 'luma',
      userId: request.userId,
      projectId: request.projectId,
      sceneId: request.sceneId,
      creditsUsed: cost,
      generationId,
      prompt: request.prompt,
    });

    return {
      videoUrl,
      generationId,
      apiUsed: 'luma',
      cost,
      duration: request.duration || 5,
    };
  }, DEFAULT_RETRY_CONFIG, classifyError);
}

// ---- Master Generator (routes to correct API) ----

const GENERATORS: Record<string, (req: VideoGenRequest) => Promise<VideoGenResponse>> = {
  sora: generateVideoSora,
  runway: generateVideoRunway,
  seedance: generateVideoSeedance,
  luma: generateVideoLuma,
};

/**
 * Generate video using the specified API
 */
export async function generateVideo(request: VideoGenRequest): Promise<VideoGenResponse> {
  const generator = GENERATORS[request.apiName];
  if (!generator) {
    throw new Error(`Unknown API: ${request.apiName}. Supported: sora, runway, seedance, luma`);
  }

  const startTime = Date.now();
  const result = await generator(request);
  const elapsed = Date.now() - startTime;

  console.log(`[VideoGen] ${request.apiName} generation completed in ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`[VideoGen] Cost: $${result.cost.toFixed(4)} | URL: ${result.videoUrl.substring(0, 60)}...`);

  return result;
}
