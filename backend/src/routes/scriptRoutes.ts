/**
 * scriptRoutes.ts - Script API Routes
 * MovieAnimation Backend - Phase 3
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as scriptController from '../controllers/scriptController';

const router = Router();

// All script routes require authentication
router.use(authenticateToken);

// CRUD
router.post('/', scriptController.createScript);
router.get('/', scriptController.listScripts);
router.get('/:id', scriptController.getScript);
router.put('/:id', scriptController.updateScript);
router.delete('/:id', scriptController.deleteScript);

// Script parsing & breakdown
router.post('/:id/parse', scriptController.parseScript);
router.get('/:id/breakdown', scriptController.getScriptBreakdown);

export default router;
