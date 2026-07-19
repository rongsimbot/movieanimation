/**
 * scriptController.ts - Script Route Handlers
 * MovieAnimation Backend - Phase 3 Script & Asset Management
 */

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as scriptModel from '../models/scriptModel';
import * as characterModel from '../models/characterModel';
import * as sceneModel from '../models/sceneModel';
import { parseScriptWithClaude, parseScriptBasic, ScriptParseResult } from '../services/scriptParser';
import { extractTextFromFile, validateScriptFile, guessTitleFromFilename, ExtractionResult } from '../services/textExtractor';
import { saveFile, deleteFile, validateFile } from '../services/assetService';
import multer from 'multer';
import path from 'path';
import pool from '../config/database';

// Configure multer for script file uploads (memory storage)
const scriptUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.txt', '.pdf', '.docx'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type "${ext}" is not supported. Upload .txt, .pdf, or .docx files.`));
    }
  },
}).single('file');

/**
 * POST /api/scripts
 * Create a new script
 */
export const createScript = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { script_title, script_content, genre, source_filename } = req.body;

    if (!script_title?.trim()) {
      return res.status(400).json({ error: 'Script title is required' });
    }
    if (!script_content?.trim()) {
      return res.status(400).json({ error: 'Script content is required' });
    }

    const script = await scriptModel.createScript({
      script_title: script_title.trim(),
      script_content,
      author: req.user?.name || undefined,
      genre: genre || null,
      source_filename: source_filename || null,
    });

    res.status(201).json({ message: 'Script created', script });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/scripts
 * List all scripts (with optional filters)
 */
export const listScripts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { author, status, genre, limit, offset } = req.query;

    const scripts = await scriptModel.getAllScripts({
      author: author as string,
      status: status as string,
      genre: genre as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    const total = await scriptModel.getScriptCount({
      author: author as string,
      status: status as string,
    });

    res.json({ scripts, total });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/scripts/:id
 * Get a single script by ID
 */
export const getScript = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid script ID' });
    }

    const script = await scriptModel.getScriptById(id);
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    res.json({ script });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/scripts/:id
 * Update a script
 */
export const updateScript = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid script ID' });
    }

    const existing = await scriptModel.getScriptById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Script not found' });
    }

    const updated = await scriptModel.updateScript(id, req.body);
    if (!updated) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    res.json({ message: 'Script updated', script: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/scripts/:id
 * Delete a script
 */
export const deleteScript = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid script ID' });
    }

    const deleted = await scriptModel.deleteScript(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Script not found' });
    }

    res.json({ message: 'Script deleted' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/scripts/:id/parse
 * Parse a script into scenes and characters using AI
 */
export const parseScript = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid script ID' });
    }

    const script = await scriptModel.getScriptById(id);
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // Try AI parsing first, fall back to basic parser
    let parsed: ScriptParseResult;
    let usedAI = false;

    try {
      parsed = await parseScriptWithClaude(script.script_content, script.script_title);
      usedAI = true;
    } catch (aiErr: any) {
      console.warn('[ScriptController] AI parsing failed, using basic parser:', aiErr.message);
      parsed = parseScriptBasic(script.script_content);
    }

    // Begin transaction
    await client.query('BEGIN');

    // Update script metadata
    await client.query(
      `UPDATE scripts SET genre = $1, word_count = $2, status = 'review' WHERE id = $3`,
      [parsed.genre, parsed.total_word_count, id]
    );

    // Create or find animation container
    let animationId = script.animation_id;
    if (!animationId) {
      const animResult = await client.query(
        `INSERT INTO animations (animation_name, script_id, owner, status)
         VALUES ($1, $2, $3, 'draft')
         RETURNING id`,
        [parsed.title || script.script_title, id, req.user?.name || 'Unknown']
      );
      animationId = animResult.rows[0].id;

      await client.query(
        'UPDATE scripts SET animation_id = $1 WHERE id = $2',
        [animationId, id]
      );
    }

    // Create characters
    const characterIds: Record<string, number> = {};
    for (const char of parsed.characters) {
      const existing = await client.query(
        'SELECT id FROM characters WHERE character_name = $1',
        [char.name]
      );

      if (existing.rows.length > 0) {
        characterIds[char.name] = existing.rows[0].id;
        // Update existing character details
        await client.query(
          `UPDATE characters SET 
           character_type = $1, description = $2, appearance_notes = $3, voice_notes = $4
           WHERE id = $5`,
          [char.type, char.description, char.appearance_notes, char.voice_notes, existing.rows[0].id]
        );
      } else {
        const result = await client.query(
          `INSERT INTO characters (character_name, character_type, description, appearance_notes, voice_notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [char.name, char.type, char.description, char.appearance_notes, char.voice_notes]
        );
        characterIds[char.name] = result.rows[0].id;
      }

      // Link character to animation
      await client.query(
        `INSERT INTO animation_characters (animation_id, character_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (animation_id, character_id) DO UPDATE SET role = $3`,
        [animationId, characterIds[char.name], char.type]
      );
    }

    // Create chapters and scenes
    const createdScenes: any[] = [];
    for (const chapter of parsed.chapters) {
      const chapterResult = await client.query(
        `INSERT INTO chapters (animation_id, chapter_number, chapter_title, content_summary)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (animation_id, chapter_number) 
         DO UPDATE SET chapter_title = $3, content_summary = $4
         RETURNING id`,
        [animationId, chapter.chapter_number, chapter.chapter_title, chapter.content_summary]
      );
      const chapterId = chapterResult.rows[0].id;

      for (const scene of chapter.scenes) {
        const sceneResult = await client.query(
          `INSERT INTO scenes (chapter_id, scene_number, scene_title, description, duration_seconds, location)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (chapter_id, scene_number)
           DO UPDATE SET scene_title = $3, description = $4, duration_seconds = $5, location = $6
           RETURNING *`,
          [
            chapterId,
            scene.scene_number,
            scene.scene_title,
            scene.description,
            scene.duration_estimate_seconds,
            scene.location,
          ]
        );
        const createdScene = sceneResult.rows[0];
        createdScenes.push(createdScene);

        // Link characters to scene
        for (const charName of scene.characters) {
          const charId = characterIds[charName];
          if (charId) {
            await client.query(
              `INSERT INTO scene_characters (scene_id, character_id, action_notes)
               VALUES ($1, $2, 'Auto-parsed')
               ON CONFLICT (scene_id, character_id) DO NOTHING`,
              [createdScene.id, charId]
            );
          }
        }
      }
    }

    await client.query('COMMIT');

    // Fetch full results
    const characters = await characterModel.getAllCharacters();
    const fullScript = await scriptModel.getScriptById(id);

    res.json({
      message: usedAI ? 'Script parsed with AI' : 'Script parsed (basic mode - AI unavailable)',
      usedAI,
      animationId,
      script: fullScript,
      characters,
      scenesCount: createdScenes.length,
      chaptersCount: parsed.chapters.length,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/scripts/:id/breakdown
 * Get existing breakdown data for a script
 */
export const getScriptBreakdown = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid script ID' });
    }

    const script = await scriptModel.getScriptById(id);
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    // If script has no animation, nothing parsed yet
    if (!script.animation_id) {
      return res.json({
        script,
        parsed: false,
        chapters: [],
        scenes: [],
        characters: [],
      });
    }

    // Get chapters
    const chaptersResult = await pool.query(
      'SELECT * FROM chapters WHERE animation_id = $1 ORDER BY chapter_number',
      [script.animation_id]
    );

    // Get all scenes for all chapters
    const chapters = chaptersResult.rows;
    let scenes: any[] = [];
    if (chapters.length > 0) {
      const scenesResult = await pool.query(
        `SELECT s.*, 
         (SELECT json_agg(json_build_object('id', c.id, 'name', c.character_name, 'action', sc.action_notes))
          FROM scene_characters sc JOIN characters c ON sc.character_id = c.id WHERE sc.scene_id = s.id
         ) as characters_in_scene
         FROM scenes s 
         WHERE s.chapter_id IN (SELECT id FROM chapters WHERE animation_id = $1)
         ORDER BY s.chapter_id, s.scene_number`,
        [script.animation_id]
      );
      scenes = scenesResult.rows;
    }

    // Get characters linked to the animation
    const charactersResult = await pool.query(
      `SELECT c.*, ac.role 
       FROM characters c 
       JOIN animation_characters ac ON c.id = ac.character_id 
       WHERE ac.animation_id = $1
       ORDER BY c.character_name`,
      [script.animation_id]
    );

    res.json({
      script,
      parsed: true,
      animationId: script.animation_id,
      chapters,
      scenes,
      characters: charactersResult.rows,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/scripts/upload-file
 * Upload a script file (.txt, .pdf, .docx) and extract text
 * Creates a new script from the extracted text
 */
export const uploadScriptFile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  scriptUpload(req, res, async (uploadErr) => {
    if (uploadErr) {
      if (uploadErr.message?.includes('File type')) {
        return res.status(400).json({ error: uploadErr.message });
      }
      if (uploadErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Max 10MB.' });
      }
      return res.status(400).json({ error: uploadErr.message });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let tempPath: string | null = null;

    try {
      // Validate file
      const validation = validateScriptFile(
        file.mimetype,
        file.originalname,
        file.size
      );
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Save to temp location for extraction
      const userId = req.user!.sub;
      const saved = await saveFile(file.buffer, file.originalname, userId);
      const { getAbsolutePath } = require('../services/assetService');
      tempPath = getAbsolutePath(saved.filePath);

      // Extract text
      const extracted: ExtractionResult = await extractTextFromFile(
        tempPath!,
        file.originalname
      );

      // Clean up temp file after extraction
      if (tempPath) {
        const { unlink } = require('fs').promises;
        await unlink(tempPath).catch(() => {});
        tempPath = null;
      }

      if (!extracted.success) {
        return res.status(400).json({ error: extracted.error });
      }

      // Auto-generate title from filename
      const autoTitle = guessTitleFromFilename(file.originalname);

      // Detect genre from content (basic keyword matching)
      const genre = detectGenreFromText(extracted.text);

      res.json({
        message: 'File uploaded and text extracted',
        fileName: extracted.fileName,
        wordCount: extracted.wordCount,
        suggestedTitle: autoTitle,
        detectedGenre: genre,
        extractedText: extracted.text,
      });
    } catch (err: any) {
      // Clean up temp file on error
      if (tempPath) {
        const { unlink } = require('fs').promises;
        await unlink(tempPath).catch(() => {});
      }
      next(err);
    }
  });
};

/**
 * Basic keyword-based genre detection
 */
function detectGenreFromText(text: string): string {
  const lower = text.toLowerCase();
  const patterns: Record<string, string[]> = {
    'sci-fi': ['spaceship', 'alien', 'robot', 'planet', 'galaxy', 'laser', 'android', 'cyber', 'future', 'space station', 'warp'],
    'fantasy': ['dragon', 'wizard', 'magic', 'castle', 'sword', 'elf', 'dwarf', 'spell', 'kingdom', 'quest', 'mythical'],
    'horror': ['monster', 'ghost', 'haunted', 'zombie', 'vampire', 'blood', 'terror', 'scream', 'darkness', 'nightmare'],
    'action': ['explosion', 'chase', 'gun', 'fight', 'battle', 'escape', 'mission', 'bomb', 'helicopter', 'agent'],
    'romance': ['love', 'kiss', 'heart', 'romantic', 'marriage', 'wedding', 'dating', 'boyfriend', 'girlfriend', 'passion'],
    'comedy': ['laugh', 'funny', 'joke', 'hilarious', 'prank', 'slapstick', 'gag', 'witty', 'absurd'],
    'drama': ['tragedy', 'emotional', 'conflict', 'family', 'divorce', 'death', 'betrayal', 'struggle', 'crisis'],
    'thriller': ['suspense', 'mystery', 'murder', 'detective', 'conspiracy', 'secret', 'spy', 'crime', 'investigation'],
  };

  const scores: Record<string, number> = {};
  for (const [genre, keywords] of Object.entries(patterns)) {
    scores[genre] = keywords.reduce((count, kw) => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      return count + (lower.match(regex)?.length || 0);
    }, 0);
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : 'unknown';
}
