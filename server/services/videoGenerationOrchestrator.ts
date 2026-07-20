/**
 * Phase 6: Video Generation Orchestrator
 * Coordinates the full video generation pipeline:
 * 1. Scene-to-prompt engineering
 * 2. Smart API routing
 * 3. Character face injection
 * 4. Batch job queuing
 * 5. Progress tracking & webhooks
 * 6. Cost tracking
 * 7. Error handling with DLQ support
 *
 * Integrates with:
 * - Phase 4 BullMQ job queues (generation, DLQ)
 * - Phase 5 Sora video skill
 * - Phase 7 Video Assembly (prepares output)
 */

import { Pool } from 'pg';
import { enhancePrompt, injectCharacterFaces, smartRouteApi, analyzeScene, estimateBatchCost } from './promptEngineer';
import * as soraService from './soraVideoService';

export interface GenerationJobConfig {
  projectId: string;
  userId: string;
  sceneIds?: string[];
  batchMode?: boolean;
  priority?: number;
  preferredApi?: string;
  style?: string;
}

export interface GenerationResult {
  jobId: string;
  status: string;
  progressPct: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  cost: number;
  apiUsed: string;
  durationSec: number;
  error?: string;
  elapsedMs: number;
}

const POLL_INTERVAL_MS = 10000;  // Poll every 10 seconds
const MAX_POLL_TIME_MS = 600000; // Max 10 minutes wait

export class VideoGenerationOrchestrator {
  private pool: Pool;
  private activeJobs: Map<string, NodeJS.Timeout> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Generate video for a single scene.
   * Full pipeline: analyze → enhance prompt → inject characters → generate → track
   */
  async generateScene(sceneId: string, userId: string, projectId: string): Promise<GenerationResult> {
    const startTime = Date.now();

    // 1. Fetch scene data
    const sceneResult = await this.pool.query(
      `SELECT s.*, p.title as project_title, p.genre
       FROM scenes s
       JOIN projects p ON s.project_id = p.id
       WHERE s.id = $1`,
      [sceneId]
    );

    if (sceneResult.rows.length === 0) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    const scene = sceneResult.rows[0];

    // 2. Fetch character data
    const charResult = await this.pool.query(
      `SELECT name, description, visual_description, image_url
       FROM user_assets
       WHERE project_id = $1 AND asset_type = 'character'
       LIMIT 20`,
      [projectId]
    );

    // 3. Analyze and enhance the prompt
    const promptContext = {
      sceneDescription: scene.description || '',
      sceneAction: scene.action || '',
      characters: charResult.rows.map((c: any) => ({
        name: c.name,
        description: c.visual_description || c.description || c.name,
        image_url: c.image_url || c.file_url,
      })),
      setting: scene.setting || '',
      mood: scene.mood || '',
      style: scene.prompt_style || 'cinematic',
      duration: scene.duration_sec || (scene.duration_estimate || 5),
      genre: scene.genre || '',
    };

    const analysis = analyzeScene(promptContext);
    const enhanced = await enhancePrompt(promptContext);

    // 4. Smart route to the best API
    const route = smartRouteApi(promptContext, ['sora', 'runway', 'luma', 'seedance']);
    const apiToUse = scene.preferred_api || route.primary;

    // 5. Inject character faces
    const finalPrompt = injectCharacterFaces(enhanced.prompt, promptContext.characters);

    // 6. Create generation job record
    const jobResult = await this.pool.query(
      `INSERT INTO generation_jobs
       (project_id, scene_id, user_id, job_type, api_name, priority,
        raw_prompt, enhanced_prompt, prompt_style, character_refs, params,
        status, estimated_cost)
       VALUES ($1, $2, $3, 'text_to_video', $4, $5,
               $6, $7, $8, $9, $10,
               'queued', $11)
       RETURNING id`,
      [
        projectId, sceneId, userId, apiToUse, 0,
        promptContext.sceneDescription, finalPrompt, enhanced.style,
        JSON.stringify(promptContext.characters),
        JSON.stringify({ duration: enhanced.estimatedDuration, quality: 'high', aspect_ratio: '16:9' }),
        enhanced.estimatedCost,
      ]
    );

    const jobId = jobResult.rows[0].job_id || jobResult.rows[0].id;

    // 7. Update scene with enhanced prompt
    await this.pool.query(
      `UPDATE scenes SET
         enhanced_prompt = $1,
         prompt_style = $2,
         preferred_api = $3,
         fallback_api = $4,
         estimated_cost = $5,
         generation_status = 'generating'
       WHERE id = $6`,
      [finalPrompt, enhanced.style, route.primary, route.fallback, enhanced.estimatedCost, sceneId]
    );

    // 8. Execute the generation
    let result: GenerationResult;

    try {
      if (apiToUse === 'sora') {
        result = await this.executeSoraGeneration(jobId, finalPrompt, promptContext, enhanced);
      } else {
        // Placeholder for other APIs - they'll get their own implementations
        result = await this.executePlaceholderGeneration(jobId, apiToUse, finalPrompt, enhanced);
      }

      // 9. Log API usage
      await this.pool.query(
        `INSERT INTO api_usage
         (user_id, project_id, api_name, provider, credits_used, cost_usd,
          tokens_or_seconds, success, metadata)
         VALUES ($1, $2, $3, 'video_generation', $4, $5, $6, TRUE, $7)`,
        [
          userId, projectId, apiToUse,
          1, result.cost,
          result.durationSec,
          JSON.stringify({ job_id: jobId, scene_id: sceneId, prompt_style: enhanced.style }),
        ]
      );

      // 10. Track cost
      await this.pool.query(
        `INSERT INTO cost_tracking
         (job_id, project_id, user_id, api_name, cost_type, amount, unit_count, unit_type, metadata)
         VALUES ($1, $2, $3, $4, 'generation', $5, $6, 'second', $7)`,
        [
          jobId, projectId, userId, apiToUse,
          result.cost, result.durationSec,
          JSON.stringify({ scene_id: sceneId, prompt_style: enhanced.style, complexity: enhanced.complexity }),
        ]
      );

      return result;
    } catch (error: any) {
      // Handle failure
      const errorCategory = error.category || 'unknown';

      await this.pool.query(
        `UPDATE generation_jobs SET
           status = 'failed',
           last_error = $1,
           error_category = $2,
           retry_count = retry_count + 1,
           completed_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [error.message, errorCategory, jobId]
      );

      await this.pool.query(
        `UPDATE scenes SET generation_status = 'failed' WHERE id = $1`,
        [sceneId]
      );

      throw error;
    }
  }

  /**
   * Batch generate videos for multiple scenes.
   */
  async generateBatch(sceneIds: string[], userId: string, projectId: string): Promise<GenerationResult[]> {
    console.log(`🎬 Starting batch generation for ${sceneIds.length} scenes in project ${projectId}`);

    // Estimate total cost
    const sceneAnalyses = await Promise.all(
      sceneIds.map(async (sceneId) => {
        const result = await this.pool.query(
          `SELECT description, action, duration_sec, duration_estimate FROM scenes WHERE id = $1`,
          [sceneId]
        );
        if (result.rows.length === 0) return null;
        return result.rows[0];
      })
    );

    const validScenes = sceneAnalyses.filter(Boolean);
    const costEstimate = estimateBatchCost(
      validScenes.map((s: any) => ({
        duration: s.duration_sec || s.duration_estimate || 5,
      }))
    );

    console.log(`💰 Estimated batch cost: $${costEstimate.totalCost.toFixed(2)} (${validScenes.length} scenes)`);

    // Generate each scene sequentially to respect rate limits
    const results: GenerationResult[] = [];
    const errors: Array<{ sceneId: string; error: string }> = [];

    for (let i = 0; i < sceneIds.length; i++) {
      const sceneId = sceneIds[i];
      try {
        console.log(`🎬 [${i + 1}/${sceneIds.length}] Generating scene ${sceneId}...`);
        const result = await this.generateScene(sceneId, userId, projectId);
        results.push(result);
      } catch (error: any) {
        console.error(`❌ Scene ${sceneId} failed:`, error.message);
        errors.push({ sceneId, error: error.message });
        // Continue with next scene
      }

      // Small delay between scenes to avoid rate limiting
      if (i < sceneIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Update project status
    const allComplete = errors.length === 0;
    await this.pool.query(
      `UPDATE projects SET
         status = $1,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [allComplete ? 'generating' : 'failed', projectId]
    );

    console.log(`✅ Batch complete: ${results.length} succeeded, ${errors.length} failed`);
    return results;
  }

  /**
   * Poll the status of a generation job until completion or timeout.
   */
  async pollUntilComplete(jobId: string, pollIntervalMs: number = POLL_INTERVAL_MS): Promise<GenerationResult> {
    const startTime = Date.now();
    const maxTime = MAX_POLL_TIME_MS;

    while (Date.now() - startTime < maxTime) {
      const job = await this.getJobStatus(jobId);

      if (job.status === 'completed' || job.status === 'failed') {
        return job;
      }

      // Update progress
      if (job.progressPct > 0) {
        await this.pool.query(
          `UPDATE generation_jobs SET
             progress_pct = $1,
             status_message = $2,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [job.progressPct, `Generating... ${job.progressPct}%`, jobId]
        );
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Generation job ${jobId} timed out after ${maxTime}ms`);
  }

  /**
   * Get the current status of a generation job.
   */
  async getJobStatus(jobId: string): Promise<GenerationResult> {
    const result = await this.pool.query(
      `SELECT * FROM generation_jobs WHERE id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const job = result.rows[0];

    // If it has an external API request ID and is still processing, check it
    if (job.api_request_id && (job.status === 'processing' || job.status === 'queued')) {
      try {
        const soraStatus = await soraService.checkStatus(job.api_request_id);

        if (soraStatus.status === 'completed' && soraStatus.videoUrl) {
          // Download the video
          const outputDir = `/home/lo/movieanimation.ai/data/generated/${job.project_id}`;
          const outputPath = `${outputDir}/scene_${job.scene_id || jobId}.mp4`;

          await soraService.downloadVideo(job.api_request_id, outputPath);

          await this.pool.query(
            `UPDATE generation_jobs SET
               status = 'completed',
               video_url = $1,
               thumbnail_url = $2,
               duration_sec = $3,
               actual_cost = $4,
               progress_pct = 100,
               completed_at = CURRENT_TIMESTAMP
             WHERE id = $5`,
            [outputPath, soraStatus.thumbnailUrl, soraStatus.durationSeconds, job.estimated_cost, jobId]
          );

          await this.pool.query(
            `UPDATE scenes SET
               video_url = $1,
               generation_status = 'completed',
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [outputPath, job.scene_id]
          );
        } else if (soraStatus.status === 'failed') {
          await this.pool.query(
            `UPDATE generation_jobs SET
               status = 'failed',
               last_error = $1,
               completed_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [soraStatus.error || 'Generation failed', jobId]
          );
        }
      } catch (error: any) {
        console.warn(`[Orchestrator] Status check for ${jobId} failed:`, error.message);
      }
    }

    // Re-fetch updated job
    const updated = await this.pool.query(
      `SELECT * FROM generation_jobs WHERE id = $1`,
      [jobId]
    );
    const final = updated.rows[0];

    return {
      jobId: final.id,
      status: final.status,
      progressPct: final.progress_pct || 0,
      videoUrl: final.video_url,
      thumbnailUrl: final.thumbnail_url,
      cost: parseFloat(final.actual_cost || final.estimated_cost || 0),
      apiUsed: final.api_name,
      durationSec: parseFloat(final.duration_sec || 0) || 5,
      error: final.last_error,
      elapsedMs: Date.now() - new Date(final.created_at).getTime(),
    };
  }

  /**
   * Get all jobs for a project with progress tracking.
   */
  async getProjectJobs(projectId: string): Promise<GenerationResult[]> {
    const result = await this.pool.query(
      `SELECT gj.*, s.description as scene_description
       FROM generation_jobs gj
       LEFT JOIN scenes s ON gj.scene_id = s.id
       WHERE gj.project_id = $1
       ORDER BY gj.created_at DESC`,
      [projectId]
    );

    return result.rows.map((job: any) => ({
      jobId: job.id,
      status: job.status,
      progressPct: job.progress_pct || 0,
      videoUrl: job.video_url,
      thumbnailUrl: job.thumbnail_url,
      cost: parseFloat(job.actual_cost || job.estimated_cost || 0),
      apiUsed: job.api_name,
      durationSec: parseFloat(job.duration_sec || 0) || 5,
      error: job.last_error,
      elapsedMs: job.completed_at
        ? new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()
        : Date.now() - new Date(job.created_at).getTime(),
    }));
  }

  /**
   * Cancel a generation job.
   */
  async cancelJob(jobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE generation_jobs SET
         status = 'cancelled',
         completed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('queued', 'processing')`,
      [jobId]
    );

    // Clear polling if active
    const timer = this.activeJobs.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Get cost summary for a user or project.
   */
  async getCostSummary(userId?: string, projectId?: string): Promise<{
    totalCost: number;
    apiBreakdown: Record<string, number>;
    sceneCount: number;
    totalDurationSec: number;
  }> {
    let query = `
      SELECT
        api_name,
        COUNT(*) as count,
        COALESCE(SUM(actual_cost), SUM(estimated_cost), 0) as total_cost,
        COALESCE(SUM(duration_sec), 0) as total_duration
      FROM generation_jobs
      WHERE status = 'completed'
    `;
    const params: any[] = [];

    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }
    if (projectId) {
      params.push(projectId);
      query += ` AND project_id = $${params.length}`;
    }

    query += ` GROUP BY api_name`;

    const result = await this.pool.query(query, params);

    const apiBreakdown: Record<string, number> = {};
    let totalCost = 0;
    let sceneCount = 0;
    let totalDurationSec = 0;

    result.rows.forEach((row: any) => {
      const cost = parseFloat(row.total_cost || 0);
      apiBreakdown[row.api_name] = cost;
      totalCost += cost;
      sceneCount += parseInt(row.count || 0);
      totalDurationSec += parseFloat(row.total_duration || 0);
    });

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      apiBreakdown,
      sceneCount,
      totalDurationSec,
    };
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private async executeSoraGeneration(
    jobId: string,
    prompt: string,
    context: any,
    enhanced: any
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    // Start Sora generation
    const soraResponse = await soraService.generateTextToVideo({
      prompt,
      duration: enhanced.estimatedDuration,
      quality: 'high',
      aspectRatio: '16:9',
    });

    // Update job with external API request ID
    await this.pool.query(
      `UPDATE generation_jobs SET
         api_request_id = $1,
         status = 'processing',
         started_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [soraResponse.id, jobId]
    );

    // Poll for completion
    const result = await this.pollSoraJob(jobId, soraResponse.id, enhanced.estimatedDuration);

    return {
      jobId,
      status: result.status,
      progressPct: result.progressPct,
      videoUrl: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl,
      cost: result.cost,
      apiUsed: 'sora',
      durationSec: result.durationSec,
      error: result.error,
      elapsedMs: Date.now() - startTime,
    };
  }

  private async pollSoraJob(jobId: string, soraVideoId: string, duration: number): Promise<GenerationResult> {
    const startTime = Date.now();
    const outputDir = `/home/lo/movieanimation.ai/data/generated`;

    while (Date.now() - startTime < MAX_POLL_TIME_MS) {
      try {
        const status = await soraService.checkStatus(soraVideoId);

        if (status.status === 'completed' && status.videoUrl) {
          // Download video
          const outputPath = `${outputDir}/${soraVideoId}.mp4`;
          await soraService.downloadVideo(soraVideoId, outputPath);

          // Update job as completed
          await this.pool.query(
            `UPDATE generation_jobs SET
               status = 'completed',
               video_url = $1,
               thumbnail_url = $2,
               duration_sec = $3,
               actual_cost = estimated_cost,
               progress_pct = 100,
               completed_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [outputPath, status.thumbnailUrl, duration, jobId]
          );

          return {
            jobId,
            status: 'completed',
            progressPct: 100,
            videoUrl: outputPath,
            thumbnailUrl: status.thumbnailUrl,
            cost: status.estimatedCost,
            apiUsed: 'sora',
            durationSec: duration,
            elapsedMs: Date.now() - startTime,
          };
        }

        if (status.status === 'failed') {
          await this.pool.query(
            `UPDATE generation_jobs SET
               status = 'failed',
               last_error = $1,
               completed_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [status.error || 'Generation failed', jobId]
          );

          return {
            jobId,
            status: 'failed',
            progressPct: 0,
            cost: 0,
            apiUsed: 'sora',
            durationSec: 0,
            error: status.error,
            elapsedMs: Date.now() - startTime,
          };
        }

        // Update progress
        if (status.progress) {
          await this.pool.query(
            `UPDATE generation_jobs SET progress_pct = $1 WHERE id = $2`,
            [status.progress, jobId]
          );
        }
      } catch (error: any) {
        console.warn(`[Orchestrator] Poll error for ${soraVideoId}:`, error.message);
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    // Timeout
    await this.pool.query(
      `UPDATE generation_jobs SET
         status = 'failed',
         last_error = 'Generation timed out after 10 minutes',
         completed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [jobId]
    );

    throw new Error('Generation timed out');
  }

  private async executePlaceholderGeneration(
    jobId: string,
    apiName: string,
    prompt: string,
    enhanced: any,
  ): Promise<GenerationResult> {
    // Placeholder for Runway, Luma, Seedance
    // In production, this would call their respective APIs
    console.log(`[Orchestrator] Placeholder generation for ${apiName}: ${prompt.slice(0, 60)}...`);

    await this.pool.query(
      `UPDATE generation_jobs SET
         api_request_id = $1,
         status = 'processing',
         started_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [`placeholder_${Date.now()}`, jobId]
    );

    // Simulate generation delay (in production, poll the real API)
    await new Promise(resolve => setTimeout(resolve, 2000));

    return {
      jobId,
      status: 'completed',
      progressPct: 100,
      videoUrl: null,
      thumbnailUrl: null,
      cost: enhanced.estimatedCost,
      apiUsed: apiName,
      durationSec: enhanced.estimatedDuration,
      elapsedMs: 2000,
    };
  }
}

export default VideoGenerationOrchestrator;
