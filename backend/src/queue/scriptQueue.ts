/**
 * scriptQueue.ts - Script Parsing Job Queue
 * MovieAnimation Backend - Phase 4 Redis Job Queue
 *
 * Handles AI-powered script parsing for scene/character breakdown.
 * Integrates with job tracking database for status monitoring.
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import * as jobModel from '../models/jobModel';
import { parseScriptWithClaude } from '../services/scriptParser';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export interface ScriptJobData {
  scriptText: string;
  scriptTitle?: string;
  scriptId?: number;
  userId: number;
  projectId?: number;
  webhookUrl?: string;
}

// ─── Queue ────────────────────────────────────────────────────────────────

export const scriptQueue = new Queue('script-parsing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: false, // Dead letter queue behavior
  },
});

// ─── Add Job ──────────────────────────────────────────────────────────────

export async function addScriptJob(data: ScriptJobData) {
  // Create DB tracking entry
  await jobModel.createJobLog({
    job_id: `script-${Date.now()}`,
    queue_name: 'script-parsing',
    job_type: 'parse-script',
    user_id: data.userId,
    project_id: data.projectId,
    status: 'pending',
    data: { scriptTitle: data.scriptTitle, textLength: data.scriptText.length },
    max_attempts: 3,
    webhook_url: data.webhookUrl,
    estimated_duration_sec: 30,
    tags: data.projectId ? [`project:${data.projectId}`] : undefined,
  });

  const job = await scriptQueue.add('parse-script', {
    scriptText: data.scriptText,
    scriptTitle: data.scriptTitle || 'Untitled Script',
    scriptId: data.scriptId,
    userId: data.userId,
    projectId: data.projectId,
    webhookUrl: data.webhookUrl,
  });

  // Update tracking with actual job ID
  await jobModel.createJobLog({
    job_id: job.id!,
    queue_name: 'script-parsing',
    job_type: 'parse-script',
    user_id: data.userId,
    project_id: data.projectId,
    data: { scriptTitle: data.scriptTitle, textLength: data.scriptText.length },
    webhook_url: data.webhookUrl,
    estimated_duration_sec: 30,
    tags: data.projectId ? [`project:${data.projectId}`] : undefined,
  });

  return job;
}

// ─── Worker ───────────────────────────────────────────────────────────────

export const scriptWorker = new Worker('script-parsing', async (job: Job) => {
  const { scriptText, scriptTitle, userId, projectId, webhookUrl } = job.data;
  const jobId = job.id!;
  const startTime = Date.now();

  console.log(`[ScriptWorker] Job ${jobId} — Parsing script: "${(scriptTitle || 'Untitled').substring(0, 50)}..."`);

  // Track start
  await jobModel.updateJobStatus(jobId, {
    status: 'active',
    progress: 10,
    attempts: job.attemptsMade,
    started_at: new Date().toISOString(),
  });

  await job.updateProgress(10);

  try {
    // Attempt AI parsing with Claude
    let parsedResult;

    try {
      parsedResult = await parseScriptWithClaude(scriptText, scriptTitle || 'Untitled Script');
      console.log(`[ScriptWorker] Job ${jobId} — AI parsing completed: ${parsedResult.chapters.length} chapters, ${parsedResult.characters.length} characters`);
    } catch (aiError: any) {
      console.warn(`[ScriptWorker] Job ${jobId} — AI parsing failed, falling back to regex: ${aiError.message}`);

      // Fallback to basic regex parsing
      parsedResult = fallbackParse(scriptText, scriptTitle);
    }

    // Update progress
    await job.updateProgress(80);
    await jobModel.updateJobStatus(jobId, {
      progress: 80,
    });

    const duration = Math.round((Date.now() - startTime) / 1000);

    // Mark complete in DB
    await jobModel.updateJobStatus(jobId, {
      status: 'completed',
      progress: 100,
      completed_at: new Date().toISOString(),
      actual_duration_sec: duration,
      result: {
        title: parsedResult.title,
        genre: parsedResult.genre,
        chapterCount: parsedResult.chapters.length,
        characterCount: parsedResult.characters.length,
        estimatedDurationMin: parsedResult.estimated_duration_minutes,
      },
    });

    await job.updateProgress(100);

    // Send webhook
    if (webhookUrl) {
      try {
        await axios.post(webhookUrl, {
          jobId,
          status: 'completed',
          result: { title: parsedResult.title, chapters: parsedResult.chapters.length, characters: parsedResult.characters.length },
        });
      } catch (e) {
        console.error('[ScriptWorker] Webhook delivery failed:', (e as Error).message);
      }
    }

    return { status: 'success', parsedResult };
  } catch (error: any) {
    const duration = Math.round((Date.now() - startTime) / 1000);

    // Check if this was the last attempt
    if (job.attemptsMade >= (job.opts.attempts || 3) - 1) {
      // Move to dead letter queue
      await jobModel.moveToDeadLetter(
        jobId,
        'script-parsing',
        'parse-script',
        userId || null,
        projectId || null,
        error.message,
        error.stack || null,
        job.attemptsMade + 1,
        { scriptText: scriptText.substring(0, 500), scriptTitle }
      );
    }

    // Update tracking
    await jobModel.updateJobStatus(jobId, {
      status: 'failed',
      error: error.message,
      error_stack: error.stack || null,
      completed_at: new Date().toISOString(),
      actual_duration_sec: duration,
      attempts: job.attemptsMade + 1,
    });

    throw error;
  }
}, {
  connection,
  concurrency: 3,
});

// ─── Worker Events ────────────────────────────────────────────────────────

scriptWorker.on('completed', async (job: Job) => {
  console.log(`[ScriptWorker] Job ${job.id} completed successfully`);
});

scriptWorker.on('failed', async (job: Job | undefined, err: Error) => {
  console.error(`[ScriptWorker] Job ${job?.id} failed: ${err.message}`);

  // Send failure webhook
  if (job?.data?.webhookUrl) {
    try {
      await axios.post(job.data.webhookUrl, {
        jobId: job.id,
        status: 'failed',
        error: err.message,
      });
    } catch (e) {
      // Ignore webhook failures
    }
  }
});

// ─── Fallback Parser ─────────────────────────────────────────────────────

function fallbackParse(scriptText: string, title?: string): any {
  const lines = scriptText.split('\n').filter(l => l.trim().length > 0);
  const scenes: any[] = [];
  const characters = new Set<string>();
  let currentScene: any = null;
  let sceneCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect scene headers like "SCENE 1:" or "INT. HOUSE - DAY"
    if (/^(SCENE|SC\.|INT\.|EXT\.|INT\/EXT\.)/i.test(trimmed)) {
      if (currentScene && currentScene.lines.length > 0) {
        scenes.push(currentScene);
      }
      sceneCount++;
      currentScene = {
        scene_number: sceneCount,
        scene_title: trimmed.substring(0, 100),
        description: trimmed,
        location: 'Unknown',
        duration_estimate_seconds: 30,
        characters: [] as string[],
        dialogue_count: 0,
        mood: 'neutral',
        lines: [],
      };
      continue;
    }

    // Detect character names (ALLCAPS lines)
    if (/^[A-Z][A-Z\s]{2,30}$/.test(trimmed) && currentScene) {
      const charName = trimmed;
      characters.add(charName);
      if (!currentScene.characters.includes(charName)) {
        currentScene.characters.push(charName);
      }
    }

    // Detect dialogue (lines starting with parentheses or after character)
    if (/^[\(]/.test(trimmed) && currentScene) {
      currentScene.dialogue_count++;
    }

    if (currentScene) {
      currentScene.lines.push(trimmed);
    }
  }

  if (currentScene && currentScene.lines.length > 0) {
    scenes.push(currentScene);
  }

  // Clean up scene objects
  const cleanedScenes = scenes.map(s => {
    const { lines, ...rest } = s;
    return rest;
  });

  return {
    title: title || 'Untitled Script',
    genre: 'unknown',
    summary: scriptText.substring(0, 200),
    total_word_count: scriptText.split(/\s+/).length,
    estimated_duration_minutes: Math.max(1, Math.round(sceneCount * 0.5)),
    characters: Array.from(characters).map(name => ({
      name,
      type: 'supporting',
      description: '',
      appearance_notes: '',
      voice_notes: '',
    })),
    chapters: [{
      chapter_number: 1,
      chapter_title: title || 'Script',
      content_summary: scriptText.substring(0, 200),
      scenes: cleanedScenes,
    }],
  };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────

export async function closeScriptQueue(): Promise<void> {
  await scriptWorker.close();
  await scriptQueue.close();
  await connection.quit();
}
