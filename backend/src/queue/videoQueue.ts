/**
 * videoQueue.ts - Redis/BullMQ Video Generation Queue
 * Enhanced with batch generation, progress tracking, and cost monitoring
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import { generateVideo, VideoGenRequest } from '../services/videoGenerator';
import { routeScene, SceneProfile } from '../services/apiRouter';
import { engineerPrompt, ScriptScene, parseScriptToScenes } from '../services/promptEngineer';
import { progressService } from '../services/progressService';
import { getUsageSummary } from '../services/costTracker';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

// ---- Queues ----

export const videoQueue = new Queue('video-generation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200, // Keep recent failures for debugging
  },
});

export const sceneQueue = new Queue('scene-generation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// Queue events for monitoring
const queueEvents = new QueueEvents('video-generation', { connection });
const sceneEvents = new QueueEvents('scene-generation', { connection });

// ---- Job Types ----

export interface VideoJobData {
  prompt: string;
  userId?: string;
  apiName?: 'sora' | 'runway' | 'seedance' | 'luma';
  projectId?: string;
  sceneId?: string;
  imageUrl?: string;
  duration?: number;
  quality?: 'standard' | 'high';
  webhookUrl?: string;
}

export interface BatchJobData {
  userId: string;
  projectId: string;
  scenes: ScriptScene[];
  characterProfiles?: Array<{
    name: string;
    appearance: string;
    traits: string[];
    photoDescription?: string;
    faceReferenceUrl?: string;
  }>;
  budget?: {
    maxCostPerScene?: number;
    maxCostPerProject?: number;
    preferSpeed?: boolean;
    preferQuality?: boolean;
  };
  webhookUrl?: string;
}

// ---- Job Adders ----

/**
 * Add a single video generation job
 */
export const addVideoJob = async (
  prompt: string,
  userId?: string,
  apiName: string = 'sora',
  options?: Partial<Omit<VideoJobData, 'prompt' | 'userId' | 'apiName'>>
) => {
  const job = await videoQueue.add('generate-video', {
    prompt,
    userId: userId || 'anonymous',
    apiName,
    ...options,
  } as VideoJobData);

  progressService.updateProgress({
    jobId: job.id || 'unknown',
    userId: userId || 'anonymous',
    projectId: options?.projectId,
    sceneId: options?.sceneId,
    state: 'queued',
    progress: 0,
    message: `Video generation queued (${apiName})`,
  });

  return job;
};

/**
 * Add a batch scene generation job
 * Parses a script, engineers prompts, routes to optimal APIs, and queues all scenes
 */
export const addBatchJob = async (data: BatchJobData) => {
  const { userId, projectId, scenes, budget } = data;

  // Initialize batch progress tracking
  const estimatedUnitCost = 0.05; // rough estimate
  const estimatedTotalCost = scenes.length * 5 * estimatedUnitCost;
  progressService.initBatch(projectId, scenes.length, estimatedTotalCost);
  progressService.updateProgress({
    jobId: `batch:${projectId}`,
    projectId,
    userId,
    state: 'starting',
    progress: 0,
    message: `Batch generation starting: ${scenes.length} scenes`,
  });

  // Engineer prompts for all scenes
  const engineeredPrompts = scenes.map(s => engineerPrompt(s));

  // Route each scene to optimal API
  const sceneProfiles: SceneProfile[] = scenes.map((s, i) => ({
    sceneNumber: s.sceneNumber,
    description: s.rawText,
    importance: inferImportance(s, i, scenes.length),
    complexity: inferComplexity(s),
    hasCharacters: (s.characters?.length || 0) > 0,
    hasCameraMovement: hasCameraAction(s.action || ''),
    durationEstimate: s.durationEstimate || 5,
    requiresHighQuality: budget?.preferQuality || false,
  }));

  // Create individual generation jobs for each scene
  const jobs: Job[] = [];
  let totalEstimatedCost = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const profile = sceneProfiles[i];
    const prompt = engineeredPrompts[i];

    // Route to best API
    const decision = routeScene(profile, budget ? {
      maxCostPerScene: budget.maxCostPerScene,
      maxCostPerProject: budget.maxCostPerProject ?? Infinity,
      preferSpeed: budget.preferSpeed ?? false,
      preferQuality: budget.preferQuality ?? false,
    } : undefined);

    totalEstimatedCost += decision.estimatedCost;

    const job = await sceneQueue.add('generate-scene', {
      prompt: prompt.positivePrompt,
      negativePrompt: prompt.negativePrompt,
      userId,
      projectId,
      sceneId: `scene-${scene.sceneNumber}`,
      sceneNumber: scene.sceneNumber,
      apiName: decision.apiName,
      duration: prompt.estimatedDuration,
      quality: decision.qualityTier,
      imageUrl: data.characterProfiles?.[0]?.faceReferenceUrl,
      styleNotes: prompt.styleNotes,
      routingReason: decision.reason,
    });

    jobs.push(job);
  }

  // Update batch progress
  progressService.updateProgress({
    jobId: `batch:${projectId}`,
    projectId,
    userId,
    state: 'generating',
    progress: 5,
    message: `${jobs.length} scenes queued across APIs. Estimated cost: $${totalEstimatedCost.toFixed(2)}`,
    metadata: {
      totalJobs: jobs.length,
      estimatedCost: totalEstimatedCost,
    },
  });

  return {
    batchId: `batch:${projectId}`,
    totalScenes: scenes.length,
    jobs: jobs.map(j => ({ id: j.id, scene: j.data.sceneNumber })),
    estimatedTotalCost,
  };
};

// ---- Workers ----

/**
 * Process single video generation
 */
export const videoWorker = new Worker('video-generation', async (job: Job<VideoJobData>) => {
  const { prompt, userId, apiName, projectId, sceneId, imageUrl, duration, quality, webhookUrl } = job.data;

  progressService.updateProgress({
    jobId: job.id || 'unknown',
    userId,
    projectId,
    sceneId,
    state: 'starting',
    progress: 10,
    message: `Starting ${apiName} video generation`,
  });

  console.log(`[Worker] Job ${job.id} | ${apiName} | "${prompt.substring(0, 60)}..."`);

  try {
    const request: VideoGenRequest = {
      prompt,
      apiName: (apiName as VideoGenRequest['apiName']) || 'sora',
      userId,
      projectId,
      sceneId,
      imageUrl,
      duration,
      quality,
    };

    // Update progress: generating
    progressService.updateProgress({
      jobId: job.id || 'unknown',
      userId,
      projectId,
      sceneId,
      state: 'generating',
      progress: 30,
      message: `Calling ${apiName} API...`,
    });

    const result = await generateVideo(request);

    // Update progress: completed
    progressService.updateProgress({
      jobId: job.id || 'unknown',
      userId,
      projectId,
      sceneId,
      state: 'completed',
      progress: 100,
      message: `Video generated successfully (${apiName})`,
      metadata: {
        videoUrl: result.videoUrl,
        generationId: result.generationId,
        apiUsed: result.apiUsed,
        cost: result.cost,
        duration: result.duration,
      },
    });

    // Fire webhook if configured
    if (webhookUrl) {
      try {
        await axios.post(webhookUrl, {
          jobId: job.id,
          status: 'completed',
          result: {
            videoUrl: result.videoUrl,
            cost: result.cost,
            apiUsed: result.apiUsed,
          },
        });
      } catch (e) {
        console.error('[Webhook] Failed to send completion webhook:', e);
      }
    }

    return {
      status: 'success',
      videoUrl: result.videoUrl,
      generationId: result.generationId,
      apiUsed: result.apiUsed,
      cost: result.cost,
    };
  } catch (error: any) {
    // Update progress: failed
    progressService.updateProgress({
      jobId: job.id || 'unknown',
      userId,
      projectId,
      sceneId,
      state: 'failed',
      progress: 0,
      message: `Generation failed: ${error.message}`,
      metadata: { error: error.message },
    });

    // Fire webhook for failure
    if (webhookUrl) {
      try {
        await axios.post(webhookUrl, {
          jobId: job.id,
          status: 'failed',
          error: error.message,
        });
      } catch (e) {
        console.error('[Webhook] Failed to send failure webhook:', e);
      }
    }

    throw new Error(`Video generation failed: ${error.message}`);
  }
}, { connection });

/**
 * Process scene generation (batch worker)
 */
export const sceneWorker = new Worker('scene-generation', async (job: Job) => {
  const { prompt, negativePrompt, userId, projectId, sceneId, sceneNumber, apiName, duration, quality, imageUrl, styleNotes } = job.data;

  progressService.updateProgress({
    jobId: job.id || 'unknown',
    userId,
    projectId,
    sceneId,
    state: 'starting',
    progress: 10,
    message: `Scene ${sceneNumber}: Starting ${apiName} generation`,
    metadata: { styleNotes, negativePrompt },
  });

  try {
    const request: VideoGenRequest = {
      prompt,
      apiName: apiName || 'sora',
      userId,
      projectId,
      sceneId,
      imageUrl,
      duration: duration || 5,
      quality: quality || 'high',
    };

    progressService.updateProgress({
      jobId: job.id || 'unknown',
      userId,
      projectId,
      sceneId,
      state: 'generating',
      progress: 30,
      message: `Scene ${sceneNumber}: Calling ${apiName} API...`,
    });

    const result = await generateVideo(request);

    progressService.updateProgress({
      jobId: job.id || 'unknown',
      userId,
      projectId,
      sceneId,
      state: 'completed',
      progress: 100,
      message: `Scene ${sceneNumber}: Generated with ${apiName} ($${result.cost.toFixed(2)})`,
      metadata: {
        videoUrl: result.videoUrl,
        generationId: result.generationId,
        apiUsed: result.apiUsed,
        cost: result.cost,
        duration: result.duration,
      },
    });

    return {
      status: 'success',
      sceneNumber,
      videoUrl: result.videoUrl,
      apiUsed: result.apiUsed,
      cost: result.cost,
    };
  } catch (error: any) {
    progressService.updateProgress({
      jobId: job.id || 'unknown',
      userId,
      projectId,
      sceneId,
      state: 'failed',
      progress: 0,
      message: `Scene ${sceneNumber}: Failed - ${error.message}`,
      metadata: { error: error.message },
    });

    throw error;
  }
}, { connection });

// ---- Worker Event Handlers ----

videoWorker.on('completed', async (job) => {
  console.log(`[Queue] Job ${job.id} completed (${job.data.apiName})`);
});

videoWorker.on('failed', async (job, err) => {
  console.error(`[Queue] Job ${job?.id} failed:`, err.message);

  if (job && job.data.webhookUrl) {
    try {
      await axios.post(job.data.webhookUrl, {
        jobId: job.id,
        status: 'failed',
        error: err.message,
      });
    } catch (e) { /* ignore */ }
  }
});

sceneWorker.on('completed', async (job) => {
  console.log(`[Queue] Scene job ${job.id} completed (scene ${job.data.sceneNumber})`);
});

sceneWorker.on('failed', async (job, err) => {
  console.error(`[Queue] Scene job ${job?.id} failed:`, err.message);
});

// ---- Pending Batches Tracking ----

queueEvents.on('completed', ({ jobId }) => {
  console.log(`[QueueEvents] Job ${jobId} completed`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.log(`[QueueEvents] Job ${jobId} failed: ${failedReason}`);
});

// ---- Utility ----

function inferImportance(scene: ScriptScene, index: number, totalScenes: number): SceneProfile['importance'] {
  // First and last scenes are usually important
  if (index === 0) return 'hero';
  if (index === totalScenes - 1) return 'major';

  // Check for importance keywords in the scene text
  const text = (scene.action + ' ' + scene.dialogue + ' ' + scene.rawText).toLowerCase();
  const heroicWords = ['climax', 'battle', 'confrontation', 'reveal', 'twist', 'hero', 'victory', 'final'];
  const majorWords = ['important', 'key', 'pivotal', 'critical', 'major', 'crucial'];

  if (heroicWords.some(w => text.includes(w))) return 'hero';
  if (majorWords.some(w => text.includes(w))) return 'major';

  // Dialogue-heavy scenes are usually major
  if ((scene.dialogue?.length || 0) > 200) return 'major';

  // Short transitional scenes = filler
  if ((scene.action?.length || 0) < 50) return 'filler';

  return 'minor';
}

function inferComplexity(scene: ScriptScene): SceneProfile['complexity'] {
  const text = (scene.action + ' ' + scene.dialogue).toLowerCase();
  const complexIndicators = [
    'crowd', 'battle', 'explosion', 'fire', 'water', 'reflection',
    'transformation', 'magic', 'particles', 'multiple', 'many',
    'complex', 'intricate', 'detailed', 'elaborate',
  ];

  const complexCount = complexIndicators.filter(w => text.includes(w)).length;

  if (complexCount >= 3) return 'high';
  if (complexCount >= 1) return 'medium';
  return 'low';
}

function hasCameraAction(action: string): boolean {
  const cameraWords = ['camera', 'pan', 'zoom', 'track', 'dolly', 'drone', 'aerial', 'sweep', 'follow', 'orbit'];
  return cameraWords.some(w => action.toLowerCase().includes(w));
}

// ---- Cleanup ----

export async function closeQueues(): Promise<void> {
  await videoWorker.close();
  await sceneWorker.close();
  await queueEvents.close();
  await sceneEvents.close();
  await videoQueue.close();
  await sceneQueue.close();
  await connection.quit();
}
