/**
 * videoRoutes.ts - Enhanced Video Generation API Routes
 * Phase 6: Smart routing, batch generation, progress tracking, cost monitoring
 */

import { Router, Request, Response } from 'express';
import { addVideoJob, addBatchJob, videoQueue, sceneQueue } from '../queue/videoQueue';
import { addAssemblyJob, assemblyQueue } from '../queue/assemblyQueue';
import { addExportJob, exportQueue } from '../queue/exportQueue';
import { routeScene, routeBatchScenes, SceneProfile, BudgetConstraints } from '../services/apiRouter';
import { engineerPrompt, parseScriptToScenes, engineerBatchPrompts, ScriptScene, CharacterProfile } from '../services/promptEngineer';
import { getUsageSummary, getRecentEntries, exportCostCsv, setBudget } from '../services/costTracker';
import { progressService } from '../services/progressService';

const router = Router();

// ═══════════════════════════════════════════
//  VIDEO GENERATION
// ═══════════════════════════════════════════

/**
 * POST /videos/generate
 * Single video generation request
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      prompt, userId, apiName, projectId, sceneId,
      imageUrl, duration, quality, webhookUrl,
    } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const job = await addVideoJob(prompt, userId || 'anonymous', apiName || 'sora', {
      projectId,
      sceneId,
      imageUrl,
      duration,
      quality,
      webhookUrl,
    });

    res.json({
      jobId: job.id,
      status: 'queued',
      apiName: apiName || 'sora',
      estimatedCost: (duration || 5) * (apiName === 'sora' ? 0.20 : apiName === 'runway' ? 0.05 : 0.02),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to queue generation job', details: error.message });
  }
});

/**
 * POST /videos/batch
 * Batch scene generation from script or scene list
 */
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const {
      userId, projectId, scenes, scriptContent,
      characterProfiles, budget, webhookUrl,
    } = req.body;

    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    // Parse scenes from script if provided, otherwise use scenes array
    let parsedScenes: ScriptScene[];
    if (scriptContent) {
      parsedScenes = parseScriptToScenes(scriptContent);
    } else if (scenes && Array.isArray(scenes)) {
      parsedScenes = scenes;
    } else {
      return res.status(400).json({ error: 'Either scriptContent or scenes array is required' });
    }

    if (parsedScenes.length === 0) {
      return res.status(400).json({ error: 'No scenes found to generate' });
    }

    // Get API routing plan for transparency
    const sceneProfiles: SceneProfile[] = parsedScenes.map((s, i) => ({
      sceneNumber: s.sceneNumber,
      description: s.rawText.substring(0, 200),
      importance: i === 0 ? 'hero' : i === parsedScenes.length - 1 ? 'major' : 'minor',
      complexity: 'medium' as const,
      hasCharacters: (s.characters?.length || 0) > 0,
      hasCameraMovement: false,
      durationEstimate: s.durationEstimate || 5,
      requiresHighQuality: budget?.preferQuality || false,
    }));

    const budgetConstraints: BudgetConstraints | undefined = budget ? {
      maxCostPerScene: budget.maxCostPerScene,
      maxCostPerProject: budget.maxCostPerProject,
      preferSpeed: budget.preferSpeed ?? false,
      preferQuality: budget.preferQuality ?? false,
    } : undefined;

    const routingPlan = routeBatchScenes(sceneProfiles, budgetConstraints);

    // Queue the batch
    const result = await addBatchJob({
      userId: userId || 'anonymous',
      projectId,
      scenes: parsedScenes,
      characterProfiles,
      budget: budgetConstraints,
      webhookUrl,
    });

    res.json({
      batchId: result.batchId,
      totalScenes: result.totalScenes,
      estimatedTotalCost: result.estimatedTotalCost,
      routingPlan: routingPlan.decisions.map(d => ({
        sceneNumber: d.estimatedCost, // placeholder, actual routing in plan
        apiName: d.apiName,
        reason: d.reason,
        estimatedCost: d.estimatedCost,
      })),
      message: `${result.totalScenes} scenes queued for generation`,
      listen: `/api/videos/progress/stream?channel=${projectId}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to queue batch generation', details: error.message });
  }
});

/**
 * POST /videos/parse-script
 * Parse a movie script into scenes (dry-run, no generation)
 */
router.post('/parse-script', async (req: Request, res: Response) => {
  try {
    const { scriptContent } = req.body;
    if (!scriptContent) return res.status(400).json({ error: 'scriptContent is required' });

    const scenes = parseScriptToScenes(scriptContent);

    res.json({
      sceneCount: scenes.length,
      scenes: scenes.map(s => ({
        sceneNumber: s.sceneNumber,
        characters: s.characters,
        setting: s.setting,
        mood: s.mood,
        estimatedDuration: s.durationEstimate,
        preview: s.rawText.substring(0, 200),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to parse script', details: error.message });
  }
});

/**
 * POST /videos/engineer-prompt
 * Engineer an optimized AI video prompt from a scene
 */
router.post('/engineer-prompt', async (req: Request, res: Response) => {
  try {
    const { scene, characters, stylePreset } = req.body;
    if (!scene) return res.status(400).json({ error: 'scene object is required' });

    const prompt = engineerPrompt(
      scene as ScriptScene,
      (characters || []) as CharacterProfile[],
      stylePreset || 'cinematic'
    );

    res.json(prompt);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to engineer prompt', details: error.message });
  }
});

// ═══════════════════════════════════════════
//  SMART API ROUTER
// ═══════════════════════════════════════════

/**
 * POST /videos/route
 * Get API routing recommendation for a scene
 */
router.post('/route', async (req: Request, res: Response) => {
  try {
    const { scene, budget } = req.body;
    if (!scene) return res.status(400).json({ error: 'scene profile is required' });

    const decision = routeScene(scene as SceneProfile, budget as BudgetConstraints);

    res.json(decision);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to route scene', details: error.message });
  }
});

/**
 * POST /videos/route-batch
 * Get API routing recommendations for multiple scenes
 */
router.post('/route-batch', async (req: Request, res: Response) => {
  try {
    const { scenes, budget } = req.body;
    if (!scenes || !Array.isArray(scenes)) {
      return res.status(400).json({ error: 'scenes array is required' });
    }

    const plan = routeBatchScenes(scenes as SceneProfile[], budget as BudgetConstraints);

    res.json(plan);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to route batch', details: error.message });
  }
});

// ═══════════════════════════════════════════
//  JOB STATUS & PROGRESS
// ═══════════════════════════════════════════

/**
 * GET /videos/status/:id
 * Get status of a single video generation job
 */
router.get('/status/:id', async (req: Request, res: Response) => {
  try {
    // Check video queue first
    let job = await videoQueue.getJob(req.params.id);
    if (!job) {
      // Check scene queue
      job = await sceneQueue.getJob(req.params.id);
    }

    if (!job) {
      // Check progress service (may have been cleaned up)
      const progress = progressService.getJobProgress(req.params.id);
      if (progress) {
        return res.json({
          id: req.params.id,
          state: progress.state,
          progress: progress.progress,
          message: progress.message,
          metadata: progress.metadata,
        });
      }
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = progressService.getJobProgress(req.params.id);

    res.json({
      id: job.id,
      state,
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
      liveProgress: progress || null,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get job status', details: error.message });
  }
});

/**
 * GET /videos/batch/:projectId
 * Get batch generation progress for a project
 */
router.get('/batch/:projectId', async (req: Request, res: Response) => {
  try {
    const batch = progressService.getBatchProgress(req.params.projectId);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found for this project' });
    }

    res.json(batch);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get batch progress', details: error.message });
  }
});

/**
 * GET /videos/progress/stream
 * SSE stream for real-time progress updates
 */
router.get('/progress/stream', (req: Request, res: Response) => {
  progressService.handleSseConnection(req, res);
});

// ═══════════════════════════════════════════
//  COST TRACKING
// ═══════════════════════════════════════════

/**
 * GET /videos/costs
 * Get cost usage summary
 */
router.get('/costs', async (req: Request, res: Response) => {
  try {
    const { userId, projectId, startDate, endDate } = req.query;
    const summary = getUsageSummary({
      userId: userId as string,
      projectId: projectId as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });

    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get cost summary', details: error.message });
  }
});

/**
 * GET /videos/costs/recent
 * Get recent cost entries
 */
router.get('/costs/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const entries = getRecentEntries(limit);
    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get cost entries', details: error.message });
  }
});

/**
 * GET /videos/costs/export
 * Export costs as CSV
 */
router.get('/costs/export', async (req: Request, res: Response) => {
  try {
    const csv = exportCostCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="movieanimation-costs.csv"');
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to export costs', details: error.message });
  }
});

/**
 * POST /videos/costs/budget
 * Set budget limits for alerts
 */
router.post('/costs/budget', async (req: Request, res: Response) => {
  try {
    const { maxTotal, maxPerApi, maxPerUser } = req.body;
    setBudget({ maxTotal, maxPerApi, maxPerUser });
    res.json({ success: true, message: 'Budget updated' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to set budget', details: error.message });
  }
});

/**
 * GET /videos/costs/estimate
 * Estimate cost for a batch of scenes
 */
router.get('/costs/estimate', async (req: Request, res: Response) => {
  try {
    const sceneCount = parseInt(req.query.scenes as string) || 1;
    const avgDuration = parseInt(req.query.duration as string) || 5;

    const { estimateBatchCost } = require('../services/costTracker');
    const estimated = estimateBatchCost(sceneCount, avgDuration);

    res.json({
      sceneCount,
      avgDurationSeconds: avgDuration,
      estimatedCost: estimated,
      perScene: estimated / sceneCount,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to estimate costs', details: error.message });
  }
});

// ═══════════════════════════════════════════
//  VIDEO ASSEMBLY (existing, unchanged)
// ═══════════════════════════════════════════

router.post('/assemble', async (req: Request, res: Response) => {
  try {
    const { userId, scenes, audioPath, outputPath } = req.body;
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ error: 'An array of scenes is required' });
    }
    if (!outputPath) return res.status(400).json({ error: 'Output path is required' });

    const job = await addAssemblyJob(userId || 'anonymous', { scenes, audioPath, outputPath });
    res.json({ jobId: job.id, status: 'queued' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to queue assembly job', details: error.message });
  }
});

router.get('/assemble/status/:id', async (req: Request, res: Response) => {
  try {
    const job = await assemblyQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Assembly job not found' });

    res.json({
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get assembly job status', details: error.message });
  }
});

// ═══════════════════════════════════════════
//  FINAL EXPORT / RENDER (existing, unchanged)
// ═══════════════════════════════════════════

router.post('/export', async (req: Request, res: Response) => {
  try {
    const { userId, inputPath, outputPath, resolution, format } = req.body;
    if (!inputPath || !outputPath || !resolution || !format) {
      return res.status(400).json({ error: 'inputPath, outputPath, resolution, and format are required' });
    }

    const job = await addExportJob(userId || 'anonymous', { inputPath, outputPath, resolution, format });
    res.json({ jobId: job.id, status: 'queued' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to queue export job', details: error.message });
  }
});

router.get('/export/status/:id', async (req: Request, res: Response) => {
  try {
    const job = await exportQueue.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Export job not found' });

    res.json({
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get export job status', details: error.message });
  }
});

// ═══════════════════════════════════════════
//  API INFORMATION
// ═══════════════════════════════════════════

/**
 * GET /videos/apis
 * Get information about available APIs and their profiles
 */
router.get('/apis', async (_req: Request, res: Response) => {
  const { getAllApiProfiles } = require('../services/apiRouter');
  res.json(getAllApiProfiles());
});

export default router;
