/**
 * Phase 6: Generation API Routes
 * REST endpoints for video generation workflows.
 *
 * Endpoints:
 * - POST /api/generate/scene       - Generate video for a single scene
 * - POST /api/generate/batch       - Batch generate videos
 * - GET  /api/generation/:jobId    - Get job status
 * - GET  /api/generation/project/:projectId - List project jobs
 * - POST /api/generation/:jobId/cancel - Cancel a job
 * - GET  /api/generation/costs      - Get cost summary
 * - POST /api/generation/webhook    - Webhook endpoint for external API callbacks
 * - GET  /api/prompt-templates       - List available prompt templates
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { VideoGenerationOrchestrator } from '../services/videoGenerationOrchestrator';
import { enhancePrompt, analyzeScene, smartRouteApi } from '../services/promptEngineer';

export function createGenerationRoutes(pool: Pool): Router {
  const router = Router();
  const orchestrator = new VideoGenerationOrchestrator(pool);

  // Auth middleware: extract user from JWT
  const requireAuth = (req: Request, res: Response, next: Function) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // In production, verify JWT properly
    // For now, assume userId is passed as a query param or header
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User ID required' });
    }

    (req as any).userId = userId;
    next();
  };

  // Apply auth to all routes
  router.use(requireAuth);

  // ─── Generate Video for a Scene ─────────────────────────────────────

  router.post('/generate/scene', async (req: Request, res: Response) => {
    try {
      const { scene_id, api_choice, priority } = req.body;
      const userId = (req as any).userId;

      if (!scene_id) {
        return res.status(400).json({ success: false, error: 'scene_id is required' });
      }

      // Verify scene belongs to user
      const sceneCheck = await pool.query(
        `SELECT s.*, p.user_id, p.id as project_id
         FROM scenes s
         JOIN projects p ON s.project_id = p.id
         WHERE s.id = $1`,
        [scene_id]
      );

      if (sceneCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Scene not found' });
      }

      const scene = sceneCheck.rows[0];
      if (scene.user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      // Generate
      const result = await orchestrator.generateScene(
        scene_id,
        userId,
        scene.project_id
      );

      return res.json({
        success: true,
        data: result,
        message: 'Video generation started',
      });
    } catch (error: any) {
      console.error('[API] Scene generation error:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        category: error.category || 'unknown',
      });
    }
  });

  // ─── Batch Generate ─────────────────────────────────────────────────

  router.post('/generate/batch', async (req: Request, res: Response) => {
    try {
      const { scene_ids, project_id } = req.body;
      const userId = (req as any).userId;

      if (!scene_ids || !Array.isArray(scene_ids) || scene_ids.length === 0) {
        return res.status(400).json({ success: false, error: 'scene_ids array is required' });
      }

      // Verify project belongs to user
      const projCheck = await pool.query(
        `SELECT user_id FROM projects WHERE id = $1`,
        [project_id]
      );

      if (projCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      if (projCheck.rows[0].user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      // Start batch generation (fires asynchronously)
      const results = await orchestrator.generateBatch(scene_ids, userId, project_id);

      return res.json({
        success: true,
        data: {
          results,
          total: scene_ids.length,
          succeeded: results.filter(r => r.status === 'completed').length,
          failed: results.filter(r => r.status === 'failed').length,
        },
      });
    } catch (error: any) {
      console.error('[API] Batch generation error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── Get Job Status ─────────────────────────────────────────────────

  router.get('/generation/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const result = await orchestrator.getJobStatus(jobId);
      return res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('[API] Job status error:', error);
      return res.status(404).json({ success: false, error: error.message });
    }
  });

  // ─── Cancel Job ─────────────────────────────────────────────────────

  router.post('/generation/:jobId/cancel', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      await orchestrator.cancelJob(jobId);
      return res.json({ success: true, message: 'Job cancelled' });
    } catch (error: any) {
      console.error('[API] Job cancel error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── List Project Jobs ──────────────────────────────────────────────

  router.get('/generation/project/:projectId', async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const userId = (req as any).userId;

      // Verify ownership
      const projCheck = await pool.query(
        `SELECT user_id FROM projects WHERE id = $1`,
        [projectId]
      );
      if (projCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      if (projCheck.rows[0].user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      const jobs = await orchestrator.getProjectJobs(projectId);
      return res.json({ success: true, data: { jobs } });
    } catch (error: any) {
      console.error('[API] Project jobs error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── Cost Summary ───────────────────────────────────────────────────

  router.get('/generation/costs', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { project_id } = req.query;

      const summary = await orchestrator.getCostSummary(
        userId,
        project_id as string | undefined
      );

      return res.json({ success: true, data: summary });
    } catch (error: any) {
      console.error('[API] Cost summary error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── Webhook Endpoint ───────────────────────────────────────────────

  router.post('/generation/webhook', async (req: Request, res: Response) => {
    try {
      const payload = req.body;
      const eventType = payload.event_type || payload.type || 'unknown';
      const jobId = payload.job_id || payload.id;

      console.log(`[Webhook] Received ${eventType} for job ${jobId}`);

      // Log the webhook
      await pool.query(
        `INSERT INTO webhook_logs (job_id, event_type, payload, source_ip)
         VALUES ($1, $2, $3, $4)`,
        [jobId, eventType, JSON.stringify(payload), req.ip]
      );

      // Handle completion
      if (eventType === 'generation.completed' && jobId) {
        const videoUrl = payload.video_url || payload.output_url;
        const thumbnailUrl = payload.thumbnail_url;

        await pool.query(
          `UPDATE generation_jobs SET
             status = 'completed',
             video_url = $1,
             thumbnail_url = $2,
             progress_pct = 100,
             completed_at = CURRENT_TIMESTAMP,
             api_response = $3
           WHERE id = $4`,
          [videoUrl, thumbnailUrl, JSON.stringify(payload), jobId]
        );

        // Update scene if linked
        const job = await pool.query(
          `SELECT scene_id FROM generation_jobs WHERE id = $1`,
          [jobId]
        );
        if (job.rows.length > 0 && job.rows[0].scene_id) {
          await pool.query(
            `UPDATE scenes SET video_url = $1, generation_status = 'completed' WHERE id = $2`,
            [videoUrl, job.rows[0].scene_id]
          );
        }
      } else if (eventType === 'generation.failed' && jobId) {
        const error = payload.error || payload.message || 'Unknown error';

        await pool.query(
          `UPDATE generation_jobs SET
             status = 'failed',
             last_error = $1,
             completed_at = CURRENT_TIMESTAMP,
             api_response = $2
           WHERE id = $3`,
          [error, JSON.stringify(payload), jobId]
        );
      } else if (eventType === 'generation.progress' && jobId) {
        const progress = payload.progress || 0;
        await pool.query(
          `UPDATE generation_jobs SET
             progress_pct = $1,
             status_message = $2
           WHERE id = $3`,
          [progress, payload.message || `Processing: ${progress}%`, jobId]
        );
      }

      return res.json({ success: true, received: true });
    } catch (error: any) {
      console.error('[Webhook] Error:', error);
      // Always return 200 to acknowledge receipt
      return res.json({ success: false, error: error.message, received: true });
    }
  });

  // ─── Prompt Analysis (Preview without generating) ──────────────────

  router.post('/generate/analyze', async (req: Request, res: Response) => {
    try {
      const { scene_description, scene_action, characters, setting, mood, style, genre } = req.body;

      const context = {
        sceneDescription: scene_description || '',
        sceneAction: scene_action || '',
        characters: characters || [],
        setting: setting || '',
        mood: mood || '',
        style: style || 'cinematic',
        genre: genre || '',
      };

      const analysis = analyzeScene(context);
      const enhanced = await enhancePrompt(context);
      const route = smartRouteApi(context);

      return res.json({
        success: true,
        data: {
          analysis,
          enhanced_prompt: enhanced.prompt,
          negative_prompt: enhanced.negativePrompt,
          routing: route,
          estimated_cost: enhanced.estimatedCost,
          complexity: enhanced.complexity,
        },
      });
    } catch (error: any) {
      console.error('[API] Prompt analysis error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ─── Prompt Templates ──────────────────────────────────────────────

  router.get('/prompt-templates', async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT * FROM prompt_templates WHERE is_active = TRUE ORDER BY name`
      );
      return res.json({ success: true, data: result.rows });
    } catch (error: any) {
      console.error('[API] Templates error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
