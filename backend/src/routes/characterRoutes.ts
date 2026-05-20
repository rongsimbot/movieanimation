/**
 * characterRoutes.ts - Character API Routes
 * MovieAnimation Backend - Phase 3
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as characterController from '../controllers/characterController';

const router = Router();

router.use(authenticateToken);

// CRUD
router.post('/', characterController.createCharacter);
router.get('/', characterController.listCharacters);
router.get('/:id', characterController.getCharacter);
router.put('/:id', characterController.updateCharacter);
router.delete('/:id', characterController.deleteCharacter);

// Image assignment
router.post('/:id/assign-image', characterController.assignImageToCharacter);
router.get('/:id/assets', characterController.getCharacterAssets);

export default router;
