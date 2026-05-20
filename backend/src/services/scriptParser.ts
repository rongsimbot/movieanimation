/**
 * scriptParser.ts - AI-Powered Script Scene Breakdown
 * MovieAnimation Backend - Phase 3 Script & Asset Management
 *
 * Uses Anthropic Claude to parse movie scripts into structured
 * scenes, characters, and chapters intelligently.
 */

import axios from 'axios';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export interface ParsedCharacter {
  name: string;
  type: 'protagonist' | 'antagonist' | 'supporting' | 'minor' | 'narrator';
  description: string;
  appearance_notes: string;
  voice_notes: string;
}

export interface ParsedScene {
  scene_number: number;
  scene_title: string;
  description: string;
  location: string;
  duration_estimate_seconds: number;
  characters: string[];
  dialogue_count: number;
  mood: string;
}

export interface ParsedChapter {
  chapter_number: number;
  chapter_title: string;
  content_summary: string;
  scenes: ParsedScene[];
}

export interface ScriptParseResult {
  title: string;
  genre: string;
  summary: string;
  total_word_count: number;
  estimated_duration_minutes: number;
  characters: ParsedCharacter[];
  chapters: ParsedChapter[];
}

/**
 * Parse a script using Anthropic Claude API
 * Breaks down the full script text into structured components
 */
export async function parseScriptWithClaude(
  scriptContent: string,
  scriptTitle: string
): Promise<ScriptParseResult> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const prompt = `You are an expert script analyst. Parse the following movie script and extract structured information.

Return ONLY valid JSON with this exact structure:
{
  "title": "string",
  "genre": "string (action, comedy, drama, horror, sci-fi, etc.)",
  "summary": "string (2-3 sentence plot summary)",
  "total_word_count": number,
  "estimated_duration_minutes": number (assume ~150 words per minute of screen time),
  "characters": [
    {
      "name": "string",
      "type": "protagonist|antagonist|supporting|minor|narrator",
      "description": "string (physical description, personality)",
      "appearance_notes": "string (key visual traits for image generation)",
      "voice_notes": "string (speaking style, accent, tone)"
    }
  ],
  "chapters": [
    {
      "chapter_number": number,
      "chapter_title": "string",
      "content_summary": "string (1-2 sentences)",
      "scenes": [
        {
          "scene_number": number,
          "scene_title": "string",
          "description": "string (visual description for video generation)",
          "location": "string",
          "duration_estimate_seconds": number,
          "characters": ["string array of character names in this scene"],
          "dialogue_count": number (estimate),
          "mood": "string (tense, peaceful, action-packed, romantic, mysterious, etc.)"
        }
      ]
    }
  ]
}

IMPORTANT RULES:
- Extract EVERY scene from the script, don't skip any.
- If the script doesn't have explicit chapter markers, group scenes into logical chapters (5-10 scenes each).
- Character descriptions should focus on VISUAL appearance for AI image generation.
- Scene descriptions should be rich visual descriptions suitable for AI video generation prompts.
- Be thorough and detailed.

SCRIPT TITLE: ${scriptTitle}

SCRIPT CONTENT:
${scriptContent.slice(0, 15000)}`;

  try {
    const response = await axios.post(
      ANTHROPIC_API_URL,
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        timeout: 60000,
      }
    );

    const content = response.data.content[0].text;
    
    // Extract JSON from the response (Claude may wrap it in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Claude response');
    }

    const parsed: ScriptParseResult = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.characters || !parsed.chapters) {
      throw new Error('Missing required fields in parsed result');
    }

    return parsed;
  } catch (err: any) {
    if (err.response?.status === 429) {
      throw new Error('AI parsing rate limited. Please try again in a moment.');
    }
    if (err.response?.status === 401) {
      throw new Error('AI service authentication failed. Contact support.');
    }
    console.error('[ScriptParser] Claude API error:', err.message);
    throw new Error(`Script parsing failed: ${err.message}`);
  }
}

/**
 * Fallback: Basic regex-based script parser (when AI is unavailable)
 */
export function parseScriptBasic(scriptContent: string): ScriptParseResult {
  const lines = scriptContent.split('\n').filter(l => l.trim());
  const wordCount = scriptContent.split(/\s+/).filter(Boolean).length;

  // Try to detect scene markers (common formats: "SCENE 1:", "INT. LOCATION - DAY", "ACT I")
  const sceneMarkers: ParsedScene[] = [];
  const characterNames = new Set<string>();
  let currentScene: Partial<ParsedScene> | null = null;
  let sceneNum = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect scene headings
    if (
      /^(SCENE|ACT|CHAPTER)\s+\d+/i.test(trimmed) ||
      /^(INT\.|EXT\.|INT\/EXT\.)/i.test(trimmed)
    ) {
      if (currentScene && currentScene.description) {
        sceneNum++;
        sceneMarkers.push({
          scene_number: sceneNum,
          scene_title: currentScene.scene_title || `Scene ${sceneNum}`,
          description: currentScene.description,
          location: currentScene.location || 'Unknown',
          duration_estimate_seconds: 30,
          characters: currentScene.characters || [],
          dialogue_count: currentScene.dialogue_count || 0,
          mood: 'neutral',
        });
      }
      currentScene = {
        scene_title: trimmed,
        location: trimmed,
        description: '',
        characters: [],
        dialogue_count: 0,
      };
      continue;
    }

    if (currentScene) {
      // Detect character dialogue (CHARACTER NAME followed by dialogue)
      const dialogueMatch = trimmed.match(/^([A-Z][A-Z\s]+)$/);
      if (dialogueMatch && trimmed.length > 2 && trimmed === trimmed.toUpperCase()) {
        characterNames.add(trimmed);
        currentScene.characters = [...(currentScene.characters || []), trimmed];
        currentScene.dialogue_count = (currentScene.dialogue_count || 0) + 1;
      }
      // Accumulate description
      if (currentScene.description !== undefined) {
        currentScene.description += ' ' + trimmed;
      }
    }
  }

  // Add final scene
  if (currentScene && currentScene.description) {
    sceneNum++;
    sceneMarkers.push({
      scene_number: sceneNum,
      scene_title: currentScene.scene_title || `Scene ${sceneNum}`,
      description: currentScene.description.slice(0, 500),
      location: currentScene.location || 'Unknown',
      duration_estimate_seconds: 30,
      characters: currentScene.characters || [],
      dialogue_count: currentScene.dialogue_count || 0,
      mood: 'neutral',
    });
  }

  // Group scenes into chapters (max 8 scenes per chapter)
  const chapters: ParsedChapter[] = [];
  for (let i = 0; i < sceneMarkers.length; i += 8) {
    const chapterScenes = sceneMarkers.slice(i, i + 8);
    chapters.push({
      chapter_number: chapters.length + 1,
      chapter_title: `Chapter ${chapters.length + 1}`,
      content_summary: `${chapterScenes.length} scenes from ${chapterScenes[0]?.scene_title || 'start'} to ${chapterScenes[chapterScenes.length - 1]?.scene_title || 'end'}`,
      scenes: chapterScenes,
    });
  }

  // If no scenes found, create a single dummy chapter
  if (chapters.length === 0) {
    chapters.push({
      chapter_number: 1,
      chapter_title: 'Full Script',
      content_summary: 'Auto-parsed script content',
      scenes: [{
        scene_number: 1,
        scene_title: 'Full Script',
        description: scriptContent.slice(0, 500),
        location: 'Various',
        duration_estimate_seconds: Math.ceil(wordCount / 2.5),
        characters: Array.from(characterNames),
        dialogue_count: 0,
        mood: 'neutral',
      }],
    });
  }

  return {
    title: 'Untitled Script',
    genre: 'unknown',
    summary: `Script with ${sceneMarkers.length} detected scenes`,
    total_word_count: wordCount,
    estimated_duration_minutes: Math.ceil(wordCount / 150),
    characters: Array.from(characterNames).map(name => ({
      name,
      type: 'supporting' as const,
      description: `Character: ${name}`,
      appearance_notes: 'No visual description available',
      voice_notes: 'Standard voice',
    })),
    chapters,
  };
}
