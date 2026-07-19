/**
 * characterController.ts - Character Route Handlers
 * MovieAnimation Backend - Phase 3 Script & Asset Management
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as characterModel from '../models/characterModel';

/**
 * POST /api/characters
 * Create a new character
 */
export const createCharacter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { character_name } = req.body;
    if (!character_name?.trim()) {
      return res.status(400).json({ error: 'Character name is required' });
    }

    const character = await characterModel.createCharacter(req.body);
    res.status(201).json({ message: 'Character created', character });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/characters
 * List all characters
 */
export const listCharacters = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query;
    const characters = await characterModel.getAllCharacters(search as string);
    res.json({ characters });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/characters/:id
 * Get a single character by ID
 */
export const getCharacter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid character ID' });

    const character = await characterModel.getCharacterById(id);
    if (!character) return res.status(404).json({ error: 'Character not found' });

    res.json({ character });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/characters/:id
 * Update a character
 */
export const updateCharacter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid character ID' });

    const existing = await characterModel.getCharacterById(id);
    if (!existing) return res.status(404).json({ error: 'Character not found' });

    const updated = await characterModel.updateCharacter(id, req.body);
    if (!updated) return res.status(400).json({ error: 'No valid fields to update' });

    res.json({ message: 'Character updated', character: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/characters/:id
 * Delete a character
 */
export const deleteCharacter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid character ID' });

    const deleted = await characterModel.deleteCharacter(id);
    if (!deleted) return res.status(404).json({ error: 'Character not found' });

    res.json({ message: 'Character deleted' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/characters/:id/assign-image
 * Assign an uploaded asset image to a character
 */
export const assignImageToCharacter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const characterId = parseInt(req.params.id, 10);
    if (isNaN(characterId)) return res.status(400).json({ error: 'Invalid character ID' });

    const { asset_id, image_url } = req.body;
    const character = await characterModel.getCharacterById(characterId);
    if (!character) return res.status(404).json({ error: 'Character not found' });

    // If image_url provided directly, update character
    if (image_url) {
      const updated = await characterModel.updateCharacter(characterId, { image_url });
      return res.json({ message: 'Character image assigned', character: updated });
    }

    // If asset_id provided, link asset to character
    if (asset_id) {
      const { updateAsset, getAssetById } = require('../models/assetModel');
      const asset = await getAssetById(asset_id);
      if (!asset) return res.status(404).json({ error: 'Asset not found' });

      await updateAsset(asset_id, { character_id: characterId });
      const updated = await characterModel.updateCharacter(characterId, {
        image_url: `/api/assets/${asset_id}/file`,
      });
      return res.json({ message: 'Asset assigned to character', character: updated });
    }

    return res.status(400).json({ error: 'Either asset_id or image_url is required' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/characters/:id/assets
 * Get all assets assigned to a character
 */
export const getCharacterAssets = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid character ID' });

    const character = await characterModel.getCharacterById(id);
    if (!character) return res.status(404).json({ error: 'Character not found' });

    const { getUserAssets } = require('../models/assetModel');
    const assets = await getUserAssets(req.user!.sub, { character_id: id });

    res.json({ character, assets });
  } catch (err) {
    next(err);
  }
};
