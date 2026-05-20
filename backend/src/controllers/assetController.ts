/**
 * assetController.ts - Asset Upload & Management Route Handlers
 * MovieAnimation Backend - Phase 3 Script & Asset Management
 */

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as assetModel from '../models/assetModel';
import { validateFile, saveFile, deleteFile, getAbsolutePath, formatFileSize, ALLOWED_MIME_TYPES } from '../services/assetService';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for memory storage (we'll save to disk manually)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type "${file.mimetype}" is not allowed`));
    }
  },
});

/**
 * POST /api/assets/upload
 * Upload one or more asset files (multipart form data)
 */
export const uploadAssets = [
  upload.array('files', 10), // Max 10 files at once
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const userId = req.user!.id;
      const { animation_id, character_id, asset_type } = req.body;

      const results = [];
      for (const file of files) {
        // Validate
        const validation = validateFile(file.mimetype, file.size);
        if (!validation.valid) {
          results.push({
            fileName: file.originalname,
            error: validation.error,
          });
          continue;
        }

        // Save to disk
        const saved = await saveFile(file.buffer, file.originalname, userId);

        // Create DB record
        const asset = await assetModel.createAsset({
          user_id: userId,
          animation_id: animation_id ? parseInt(animation_id, 10) : undefined,
          character_id: character_id ? parseInt(character_id, 10) : undefined,
          file_name: saved.fileName,
          file_path: saved.filePath,
          file_size: saved.fileSize,
          mime_type: file.mimetype,
          asset_type: asset_type || 'character_photo',
        });

        results.push({
          id: asset.id,
          fileName: asset.file_name,
          fileSize: formatFileSize(asset.file_size),
          mimeType: asset.mime_type,
          assetType: asset.asset_type,
          url: `/api/assets/${asset.id}/file`,
        });
      }

      res.status(201).json({
        message: `${results.filter((r: any) => !r.error).length} of ${files.length} files uploaded`,
        assets: results,
      });
    } catch (err) {
      next(err);
    }
  },
];

/**
 * POST /api/assets/upload-base64
 * Upload a single asset as base64 in JSON body
 */
export const uploadBase64 = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { file_name, file_data, mime_type, asset_type, animation_id, character_id } = req.body;

    if (!file_data || !file_name) {
      return res.status(400).json({ error: 'file_name and file_data are required' });
    }

    // Decode base64
    const matches = file_data.match(/^data:([^;]+);base64,(.+)$/);
    let buffer: Buffer;
    let detectedMimeType = mime_type;

    if (matches) {
      detectedMimeType = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(file_data, 'base64');
    }

    // Validate
    const validation = validateFile(detectedMimeType, buffer.length);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const userId = req.user!.id;

    // Save file
    const saved = await saveFile(buffer, file_name, userId);

    // Create DB record
    const asset = await assetModel.createAsset({
      user_id: userId,
      animation_id: animation_id || undefined,
      character_id: character_id || undefined,
      file_name: saved.fileName,
      file_path: saved.filePath,
      file_size: saved.fileSize,
      mime_type: detectedMimeType,
      asset_type: asset_type || 'character_photo',
    });

    res.status(201).json({
      message: 'Asset uploaded',
      asset: {
        id: asset.id,
        fileName: asset.file_name,
        fileSize: formatFileSize(asset.file_size),
        mimeType: asset.mime_type,
        assetType: asset.asset_type,
        url: `/api/assets/${asset.id}/file`,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/assets
 * List user's assets
 */
export const listAssets = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { asset_type, animation_id, character_id, limit, offset } = req.query;

    const assets = await assetModel.getUserAssets(userId, {
      asset_type: asset_type as string,
      animation_id: animation_id ? parseInt(animation_id as string, 10) : undefined,
      character_id: character_id ? parseInt(character_id as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    const stats = await assetModel.getAssetStats(userId);

    // Add display URLs
    const assetsWithUrl = assets.map(a => ({
      ...a,
      url: `/api/assets/${a.id}/file`,
      fileSizeFormatted: formatFileSize(a.file_size),
    }));

    res.json({ assets: assetsWithUrl, stats });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/assets/:id
 * Get a single asset
 */
export const getAsset = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid asset ID' });

    const asset = await assetModel.getAssetById(id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    res.json({
      asset: {
        ...asset,
        url: `/api/assets/${asset.id}/file`,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/assets/:id/file
 * Serve the actual file
 */
export const serveAssetFile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid asset ID' });

    const asset = await assetModel.getAssetById(id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const absolutePath = getAbsolutePath(asset.file_path);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Asset file not found on disk' });
    }

    res.setHeader('Content-Type', asset.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${asset.file_name}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache

    const stream = fs.createReadStream(absolutePath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/assets/:id
 * Update asset metadata
 */
export const updateAsset = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid asset ID' });

    const existing = await assetModel.getAssetById(id);
    if (!existing) return res.status(404).json({ error: 'Asset not found' });

    const updated = await assetModel.updateAsset(id, req.body);
    if (!updated) return res.status(400).json({ error: 'No valid fields to update' });

    res.json({ message: 'Asset updated', asset: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/assets/:id
 * Delete an asset
 */
export const deleteAsset = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid asset ID' });

    const asset = await assetModel.deleteAsset(id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    // Delete file from disk
    await deleteFile(asset.file_path);

    res.json({ message: 'Asset deleted', asset: { id: asset.id, fileName: asset.file_name } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/assets/stats
 * Get asset statistics for current user
 */
export const getAssetStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const stats = await assetModel.getAssetStats(userId);
    res.json({ stats });
  } catch (err) {
    next(err);
  }
};
