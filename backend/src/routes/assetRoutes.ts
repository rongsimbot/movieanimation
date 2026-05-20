/**
 * assetRoutes.ts - Asset Upload & Management Routes
 * MovieAnimation Backend - Phase 3
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as assetController from '../controllers/assetController';

const router = Router();

router.use(authenticateToken);

// File upload (multipart)
router.post('/upload', ...assetController.uploadAssets);

// Base64 upload
router.post('/upload-base64', assetController.uploadBase64);

// Asset management
router.get('/', assetController.listAssets);
router.get('/stats', assetController.getAssetStats);
router.get('/:id', assetController.getAsset);
router.get('/:id/file', assetController.serveAssetFile);
router.put('/:id', assetController.updateAsset);
router.delete('/:id', assetController.deleteAsset);

export default router;
