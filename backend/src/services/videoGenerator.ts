/**
 * videoGenerator.ts - Multi-API Video Generation Service
 * Integrates Sora, Runway, Seedance APIs with key rotation,
 * cross-API failover, retry logic, and cost tracking.
 */

import axios from 'axios';
import { trackCost, trackFailedCost } from './costTracker';
import { getApiKey, markKeyRateLimited, markKeySuccess, markKeyFailed, ApiProvider } from './keyManager';
import { executeWithFailover, reportSuccess, reportFailure, FailoverResult } from './apiFailover';

// ---- Types ----

export interface VideoGenRequest {
  prompt: string;
  apiName: ApiProvider;
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
  failover?: FailoverResult;
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

function getRetryDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

function classifyError(error: any): 'retryable' | 'fatal' {
  if (!error.response) return 'retryable';
  const status = error.response.status;
  if (status === 429 || status >= 500 || status === 408) return 'retryable';
  if (status === 401 || status === 403 || status === 400 || status === 404) return 'fatal';
  return 'retryable';
}

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
      const classification = errorClassifier ? errorClassifier(error) : classifyError(error);
      if (classification === 'fatal' || attempt === config.maxAttempts - 1) throw error;
      let delay = getRetryDelay(attempt, config);
      if (error.response?.status === 429) {
        const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '0', 10);
        if (retryAfter > 0) delay = retryAfter * 1000;
      }
      console.log(`[Retry] Attempt ${attempt + 1}/${config.maxAttempts} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// ---- API Base URLs ----

const API_CONFIG: Record<ApiProvider, { baseUrl: string; costPerSecond: number; maxDuration: number }> = {
  sora: { baseUrl: 'https://api.openai.com/v1/videos', costPerSecond: 0.20, maxDuration: 10 },
  runway: { baseUrl: 'https://api.dev.runwayml.com/v1', costPerSecond: 0.05, maxDuration: 10 },
  seedance: { baseUrl: 'https://api.seedance.io/v1', costPerSecond: 0.02, maxDuration: 5 },
  luma: { baseUrl: 'https://api.lumalabs.ai/dream-machine/v1', costPerSecond: 0.03, maxDuration: 5 },
};

// ---- Per-API Generation Functions ----

async function generateSora(request: VideoGenRequest): Promise<VideoGenResponse> {
  const apiKey = getApiKey('sora');
  const cfg = API_CONFIG.sora;

  console.log(`[Sora] Generating with key (length:${apiKey.length})...`);

  return withRetry(async () => {
    const payload: any = {
      model: 'sora-2',
      prompt: request.prompt,
      duration: Math.min(request.duration || 5, cfg.maxDuration),
      aspect_ratio: request.aspectRatio || '16:9',
      quality: request.quality || 'high',
    };
    if (request.imageUrl) payload.image_url = request.imageUrl;

    const response = await axios.post(`${cfg.baseUrl}/generations`, payload, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const generationId = response.data.id;
    const videoUrl = await pollSoraGeneration(generationId, apiKey);

    const cost = (request.duration || 5) * cfg.costPerSecond;
    markKeySuccess('sora', apiKey, cost);

    trackCost({
      apiName: 'sora',
      userId: request.userId,
      projectId: request.projectId,
      sceneId: request.sceneId,
      creditsUsed: cost,
      generationId,
      prompt: request.prompt,
    });

    return { videoUrl, generationId, apiUsed: 'sora', cost, duration: request.duration || 5 };
  }, DEFAULT_RETRY_CONFIG, (error) => {
    const classification = classifyError(error);
    if (classification === 'fatal') {
      markKeyFailed('sora', apiKey, `Fatal: ${error.message}`);
    } else if (error.response?.status === 429) {
      markKeyRateLimited('sora', apiKey);
    }
    return classification;
  });
}

async function pollSoraGeneration(generationId: string, apiKey: string, maxAttempts = 30): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    const statusRes = await axios.get(`${API_CONFIG.sora.baseUrl}/generations/${generationId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const state = statusRes.data.status || statusRes.data.state;
    if (state === 'completed' || state === 'succeeded') {
      const videoUrl = statusRes.data.video_url || statusRes.data.assets?.video;
      if (!videoUrl) throw new Error('Sora generation completed but no video URL returned');
      return videoUrl;
    }
    if (state === 'failed') throw new Error(`Sora generation failed: ${statusRes.data.failure_reason || 'Unknown error'}`);
  }
  throw new Error('Sora generation timed out after 5 minutes');
}

async function generateRunway(request: VideoGenRequest): Promise<VideoGenResponse> {
  const apiKey = getApiKey('runway');
  const cfg = API_CONFIG.runway;

  console.log(`[Runway] Generating with key (length:${apiKey.length})...`);

  return withRetry(async () => {
    if (!request.imageUrl) {
      console.warn('[Runway] No imageUrl provided - Runway works best with image-to-video.');
    }

    const payload: any = {
      model: 'gen4.5',
      promptText: request.prompt,
      ratio: '1280:720',
      duration: Math.min(request.duration || 5, cfg.maxDuration),
      generateAudio: false,
    };
    if (request.imageUrl) payload.imageUrl = request.imageUrl;

    const response = await axios.post(`${cfg.baseUrl}/text_to_video`, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    const taskId = response.data.id;
    const videoUrl = await pollRunwayTask(taskId, apiKey);

    const cost = (request.duration || 5) * cfg.costPerSecond;
    markKeySuccess('runway', apiKey, cost);

    trackCost({
      apiName: 'runway', userId: request.userId, projectId: request.projectId,
      sceneId: request.sceneId, creditsUsed: cost, generationId: taskId, prompt: request.prompt,
    });

    return { videoUrl, generationId: taskId, apiUsed: 'runway', cost, duration: request.duration || 5 };
  }, DEFAULT_RETRY_CONFIG, (error) => {
    const classification = classifyError(error);
    if (classification === 'fatal') markKeyFailed('runway', apiKey, `Fatal: ${error.message}`);
    else if (error.response?.status === 429) markKeyRateLimited('runway', apiKey);
    return classification;
  });
}

async function pollRunwayTask(taskId: string, apiKey: string, maxAttempts = 30): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    const statusRes = await axios.get(`${API_CONFIG.runway.baseUrl}/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' },
    });
    if (statusRes.data.status === 'SUCCEEDED') {
      const videoUrl = statusRes.data.output?.[0];
      if (!videoUrl) throw new Error('Runway task succeeded but no output URL');
      return videoUrl;
    }
    if (statusRes.data.status === 'FAILED') throw new Error('Runway generation failed');
  }
  throw new Error('Runway generation timed out');
}

async function generateSeedance(request: VideoGenRequest): Promise<VideoGenResponse> {
  const apiKey = getApiKey('seedance');
  const cfg = API_CONFIG.seedance;

  console.log(`[Seedance] Generating with key (length:${apiKey.length})...`);

  return withRetry(async () => {
    const payload: any = {
      text_prompt: request.prompt,
      duration: Math.min(request.duration || 3, cfg.maxDuration),
      aspect_ratio: request.aspectRatio || '16:9',
    };
    if (request.imageUrl) payload.image_input = request.imageUrl;

    const response = await axios.post(`${cfg.baseUrl}/generate`, payload, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const generationId = response.data.generation_id || response.data.id;
    const videoUrl = await pollSeedanceGeneration(generationId, apiKey);

    const cost = Math.min(request.duration || 3, 5) * cfg.costPerSecond;
    markKeySuccess('seedance', apiKey, cost);

    trackCost({
      apiName: 'seedance', userId: request.userId, projectId: request.projectId,
      sceneId: request.sceneId, creditsUsed: cost, generationId, prompt: request.prompt,
    });

    return { videoUrl, generationId, apiUsed: 'seedance', cost, duration: Math.min(request.duration || 3, 5) };
  }, DEFAULT_RETRY_CONFIG, (error) => {
    const classification = classifyError(error);
    if (classification === 'fatal') markKeyFailed('seedance', apiKey, `Fatal: ${error.message}`);
    else if (error.response?.status === 429) markKeyRateLimited('seedance', apiKey);
    return classification;
  });
}

async function pollSeedanceGeneration(generationId: string, apiKey: string, maxAttempts = 30): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    const statusRes = await axios.get(`${API_CONFIG.seedance.baseUrl}/status/${generationId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const state = statusRes.data.status || statusRes.data.state;
    if (state === 'completed' || state === 'done') {
      const videoUrl = statusRes.data.video_url || statusRes.data.output_url;
      if (!videoUrl) throw new Error('Seedance generation completed but no video URL');
      return videoUrl;
    }
    if (state === 'failed' || state === 'error') {
      throw new Error(`Seedance generation failed: ${statusRes.data.error || 'Unknown'}`);
    }
  }
  throw new Error('Seedance generation timed out');
}

async function generateLuma(request: VideoGenRequest): Promise<VideoGenResponse> {
  const apiKey = getApiKey('luma');
  const cfg = API_CONFIG.luma;

  console.log(`[Luma] Generating with key...`);

  return withRetry(async () => {
    const response = await axios.post(`${cfg.baseUrl}/generations`, {
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio || '16:9',
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const generationId = response.data.id;
    let videoUrl: string | null = null;

    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      const statusRes = await axios.get(`${cfg.baseUrl}/generations/${generationId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (statusRes.data.state === 'completed') {
        videoUrl = statusRes.data.assets?.video;
        break;
      } else if (statusRes.data.state === 'failed') {
        throw new Error(`Luma generation failed: ${statusRes.data.failure_reason}`);
      }
    }

    if (!videoUrl) throw new Error('Luma generation timed out');

    const cost = (request.duration || 5) * cfg.costPerSecond;
    markKeySuccess('luma', apiKey, cost);

    trackCost({
      apiName: 'luma', userId: request.userId, projectId: request.projectId,
      sceneId: request.sceneId, creditsUsed: cost, generationId, prompt: request.prompt,
    });

    return { videoUrl, generationId, apiUsed: 'luma', cost, duration: request.duration || 5 };
  }, DEFAULT_RETRY_CONFIG, (error) => {
    const classification = classifyError(error);
    if (classification === 'fatal') markKeyFailed('luma', apiKey, `Fatal: ${error.message}`);
    else if (error.response?.status === 429) markKeyRateLimited('luma', apiKey);
    return classification;
  });
}

// ---- Master Generator with Failover ----

const GENERATORS: Record<ApiProvider, (req: VideoGenRequest) => Promise<VideoGenResponse>> = {
  sora: generateSora,
  runway: generateRunway,
  seedance: generateSeedance,
  luma: generateLuma,
};

/**
 * Generate video using the specified API, with automatic cross-API failover.
 * If the primary API fails, it automatically tries runways, then seedance, then luma.
 */
export async function generateVideo(request: VideoGenRequest): Promise<VideoGenResponse> {
  const startTime = Date.now();

  const { result, failover, attempts } = await executeWithFailover(
    request.apiName,
    async (provider: ApiProvider) => {
      const generator = GENERATORS[provider];
      if (!generator) throw new Error(`Unknown API: ${provider}`);
      return generator({ ...request, apiName: provider });
    },
    {
      strategy: 'quality-first',
      allowQualityDegradation: true,
      onFailover: (from, to, reason) => {
        console.warn(`[VideoGen] ⚠️ Failover: ${from} → ${to} (${reason})`);
      },
    }
  );

  if (!failover.success || !result) {
    // Track failed cost for the primary API
    trackFailedCost({
      apiName: request.apiName,
      userId: request.userId,
      projectId: request.projectId,
      sceneId: request.sceneId,
      cost: 0,
      creditsUsed: 0,
      generationId: 'failed',
      prompt: request.prompt,
    });

    throw new Error(`All APIs failed for prompt "${request.prompt.substring(0, 50)}...". Failover chain: ${failover.message}`);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[VideoGen] ${failover.apiUsed} completed in ${(elapsed / 1000).toFixed(1)}s (cost: $${result.cost.toFixed(4)})`);

  return {
    ...result,
    failover,
  };
}

/**
 * Generate video with a specific API (no failover — direct call)
 * Used when you want to force a specific API
 */
export async function generateVideoDirect(request: VideoGenRequest): Promise<VideoGenResponse> {
  const generator = GENERATORS[request.apiName];
  if (!generator) {
    throw new Error(`Unknown API: ${request.apiName}. Supported: sora, runway, seedance, luma`);
  }

  const startTime = Date.now();
  const result = await generator(request);
  const elapsed = Date.now() - startTime;

  console.log(`[VideoGen] ${request.apiName} completed in ${(elapsed / 1000).toFixed(1)}s (cost: $${result.cost.toFixed(4)})`);
  return result;
}
