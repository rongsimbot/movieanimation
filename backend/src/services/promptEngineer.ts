/**
 * promptEngineer.ts - Scene-to-Prompt Engineering Service
 *
 * Transforms raw user scripts/scenes into optimized AI video generation prompts.
 * Handles:
 * - Scene breakdown from scripts
 * - Cinematic enhancement (camera angles, lighting, mood)
 * - Character face injection
 * - Style consistency across scenes
 * - Negative prompt generation
 */

export interface ScriptScene {
  sceneNumber: number;
  rawText: string;
  characters?: string[];
  setting?: string;
  action?: string;
  dialogue?: string;
  mood?: string;
  durationEstimate?: number;
}

export interface EngineeredPrompt {
  sceneNumber: number;
  positivePrompt: string;
  negativePrompt: string;
  characters: string[];
  styleNotes: string;
  cameraDirections: string;
  estimatedDuration: number;
}

export interface CharacterProfile {
  name: string;
  photoDescription: string;
  faceReferenceUrl?: string;
  traits: string[];
  appearance: string;
}

// ---- Prompt Templates ----

const CINEMATIC_STYLES: Record<string, string> = {
  epic: 'epic cinematic, sweeping camera movement, dramatic lighting, 4K, film grain, anamorphic lens, rich color grading',
  intimate: 'intimate close-up, shallow depth of field, soft lighting, warm tones, 35mm lens, natural light',
  action: 'dynamic action sequence, fast camera movement, motion blur, high contrast, handheld feel, intense pacing',
  moody: 'atmospheric, low-key lighting, shadows, film noir style, moody color palette, slow camera movement',
  bright: 'bright and airy, natural sunlight, vibrant colors, wide angle, clean composition, uplifting atmosphere',
  documentary: 'documentary style, handheld camera, natural lighting, vérité feel, medium shots, realistic colors',
};

const CAMERA_DIRECTIONS: Record<string, string> = {
  wide: 'wide establishing shot, full environment visible, grand scale',
  medium: 'medium shot, waist-up framing, balanced composition',
  close: 'close-up shot, face filling frame, emotional, intimate',
  tracking: 'smooth tracking shot, camera follows subject, fluid motion',
  drone: 'aerial drone shot, sweeping overhead perspective, birds eye view',
  dolly: 'dolly zoom effect, perspective shift, dramatic reveal',
  handheld: 'handheld camera, slight shake, documentary feel, immersive',
  static: 'static tripod shot, locked-off camera, precise framing',
};

// ---- Scene-to-Prompt Engineering ----

/**
 * Engineer an optimized prompt from a raw script scene
 */
export function engineerPrompt(
  scene: ScriptScene,
  characters: CharacterProfile[] = [],
  stylePreset: string = 'cinematic'
): EngineeredPrompt {
  const chars = scene.characters || [];
  const setting = scene.setting || 'undefined setting';
  const action = scene.action || scene.rawText;
  const mood = scene.mood || 'neutral';

  // Build character descriptions
  const characterDescriptions = chars
    .map(name => {
      const profile = characters.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (profile) {
        return `"${profile.name}" (${profile.appearance})`;
      }
      return `"${name}"`;
    })
    .join(' and ');

  // Get style components
  const styleKey = mapMoodToStyle(mood);
  const cinematicStyle = CINEMATIC_STYLES[styleKey] || CINEMATIC_STYLES.moody;
  const cameraDirection = inferCameraDirection(action);

  // Build positive prompt
  const positivePrompt = [
    `A cinematic movie scene of ${characterDescriptions || 'characters'} in ${setting}`,
    action ? `where ${action}` : '',
    cameraDirection,
    cinematicStyle,
    'professional movie quality',
  ].filter(Boolean).join(', ');

  // Build negative prompt
  const negativePrompt = [
    'text, watermark, logo, subtitles',
    'blurry, low quality, pixelated',
    'distorted faces, extra limbs, mutated',
    'cartoon, anime, illustration, 3D render',
    'ugly, deformed, disfigured',
    'overexposed, underexposed',
  ].join(', ');

  // Style notes for consistency
  const styleNotes = `Style: ${styleKey}, Mood: ${mood}, Preset: ${stylePreset}`;

  return {
    sceneNumber: scene.sceneNumber,
    positivePrompt: positivePrompt.substring(0, 1000), // OpenAI limit
    negativePrompt,
    characters: chars,
    styleNotes,
    cameraDirections: cameraDirection,
    estimatedDuration: scene.durationEstimate || 5,
  };
}

/**
 * Batch engineer prompts for all scenes in a script
 */
export function engineerBatchPrompts(
  scenes: ScriptScene[],
  characters: CharacterProfile[] = [],
  stylePreset: string = 'cinematic'
): EngineeredPrompt[] {
  return scenes.map(scene => engineerPrompt(scene, characters, stylePreset));
}

/**
 * Map emotional mood to visual style key
 */
function mapMoodToStyle(mood: string): string {
  const moodMap: Record<string, string> = {
    happy: 'bright',
    joyful: 'bright',
    sad: 'moody',
    tense: 'moody',
    angry: 'action',
    excited: 'action',
    romantic: 'intimate',
    peaceful: 'intimate',
    mysterious: 'moody',
    heroic: 'epic',
    epic: 'epic',
    terrifying: 'moody',
    suspenseful: 'moody',
    neutral: 'documentary',
  };

  return moodMap[mood.toLowerCase()] || 'documentary';
}

/**
 * Infer camera direction from action description
 */
function inferCameraDirection(action: string): string {
  const lower = action.toLowerCase();

  if (lower.includes('chase') || lower.includes('run') || lower.includes('fight')) {
    return CAMERA_DIRECTIONS.handheld;
  }
  if (lower.includes('walk') || lower.includes('move') || lower.includes('follow')) {
    return CAMERA_DIRECTIONS.tracking;
  }
  if (lower.includes('landscape') || lower.includes('city') || lower.includes('skyline')) {
    return CAMERA_DIRECTIONS.drone;
  }
  if (lower.includes('reveal') || lower.includes('shock') || lower.includes('twist')) {
    return CAMERA_DIRECTIONS.dolly;
  }
  if (lower.includes('emotional') || lower.includes('cry') || lower.includes('whisper')) {
    return CAMERA_DIRECTIONS.close;
  }
  if (lower.includes('enter') || lower.includes('arrive') || lower.includes('establish')) {
    return CAMERA_DIRECTIONS.wide;
  }

  return CAMERA_DIRECTIONS.medium; // default
}

// ---- Character Face Injection ----

/**
 * Inject character photo references into a prompt
 * Creates a face-enhanced prompt for better character consistency
 */
export function injectCharacterFaces(
  prompt: string,
  characters: CharacterProfile[]
): string {
  if (characters.length === 0) return prompt;

  const faceDescriptions = characters
    .map(c => `"${c.name}" appears as: ${c.appearance}. ${c.photoDescription}`)
    .join(' ');

  // Inject after the opening description
  const enhancedPrompt = prompt.replace(
    /^A cinematic movie scene of /,
    `A cinematic movie scene of ${faceDescriptions}. `
  );

  return enhancedPrompt.substring(0, 1000);
}

/**
 * Build a character profile from user input
 */
export function buildCharacterProfile(
  name: string,
  appearance: string,
  traits: string[],
  photoDescription?: string,
  faceReferenceUrl?: string
): CharacterProfile {
  return {
    name,
    photoDescription: photoDescription || `${appearance}, well-lit portrait, clear facial features`,
    faceReferenceUrl,
    traits,
    appearance,
  };
}

// ---- Utility ----

/**
 * Estimate scene duration from text length and action density
 */
export function estimateDuration(text: string): number {
  const wordCount = text.split(/\s+/).length;

  // Approximate: ~15 words = 1 second of action
  const baseDuration = Math.max(3, Math.ceil(wordCount / 15));

  // Action words suggest shorter, punchier scenes
  const actionWords = ['chase', 'fight', 'run', 'jump', 'shoot', 'explode', 'punch'];
  const hasAction = actionWords.some(w => text.toLowerCase().includes(w));

  return hasAction ? Math.min(baseDuration, 8) : Math.min(baseDuration, 10);
}

/**
 * Parse a raw script into individual scenes
 * Simple parser: splits on scene markers like "SCENE X:" or "INT./EXT."
 */
export function parseScriptToScenes(scriptContent: string): ScriptScene[] {
  const sceneMarkers = [
    /SCENE\s+(\d+)[\s:]+/gi,
    /INT\.\s+.*?(?=INT\.|EXT\.|$)/gs,
    /EXT\.\s+.*?(?=INT\.|EXT\.|$)/gs,
  ];

  // Simple approach: split on common scene markers
  const lines = scriptContent.split('\n').filter(line => line.trim());

  const scenes: ScriptScene[] = [];
  let currentScene: ScriptScene | null = null;
  let sceneNumber = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect scene start
    const sceneMatch = trimmed.match(/^(?:SCENE|Scene)\s+(\d+)[\s:]+(.+)/i);
    const intExtMatch = trimmed.match(/^(INT\.|EXT\.)\s+(.+)/i);
    const numberMatch = trimmed.match(/^(\d+)[\s.]+(.+)/);

    if (sceneMatch || intExtMatch || numberMatch) {
      // Push previous scene
      if (currentScene) {
        scenes.push(currentScene);
      }

      sceneNumber++;
      const location = sceneMatch?.[2] || intExtMatch?.[2] || numberMatch?.[2] || '';
      const setting = intExtMatch?.[1] ? `${intExtMatch[1]} ${location}` : location;

      currentScene = {
        sceneNumber,
        rawText: trimmed,
        setting,
        characters: extractCharacters(trimmed),
        action: location,
        dialogue: '',
        mood: inferMood(trimmed),
        durationEstimate: estimateDuration(trimmed),
      };
    } else if (currentScene) {
      // Check for character dialogue
      const dialogueMatch = trimmed.match(/^([A-Z][A-Z\s]+):\s*(.+)/);
      if (dialogueMatch) {
        const characterName = dialogueMatch[1].trim();
        if (!currentScene.characters?.includes(characterName)) {
          currentScene.characters = [...(currentScene.characters || []), characterName];
        }
        currentScene.dialogue += `${characterName}: ${dialogueMatch[2]}\n`;
        currentScene.rawText += '\n' + trimmed;
        currentScene.durationEstimate = estimateDuration(currentScene.rawText);
      } else {
        currentScene.action = (currentScene.action || '') + ' ' + trimmed;
        currentScene.rawText += '\n' + trimmed;
        currentScene.durationEstimate = estimateDuration(currentScene.rawText);
      }
    }
  }

  // Push final scene
  if (currentScene) {
    scenes.push(currentScene);
  }

  // If no scenes detected, treat entire script as one scene
  if (scenes.length === 0) {
    scenes.push({
      sceneNumber: 1,
      rawText: scriptContent,
      characters: extractCharacters(scriptContent),
      setting: 'a scene',
      action: scriptContent,
      dialogue: '',
      mood: inferMood(scriptContent),
      durationEstimate: estimateDuration(scriptContent),
    });
  }

  return scenes;
}

/**
 * Extract character names from text (capitalized words that look like names)
 */
function extractCharacters(text: string): string[] {
  // Match ALL CAPS words that might be character names
  const matches = text.match(/\b([A-Z][A-Z]+)\b/g);
  if (matches) {
    return [...new Set(matches)].filter(name => name.length > 1 && name.length < 20);
  }

  // Fallback: match capitalized words (potential names)
  const capWords = text.match(/\b([A-Z][a-z]+)\b/g);
  if (capWords) {
    return [...new Set(capWords)].filter(name =>
      name.length > 2 &&
      !['The', 'And', 'But', 'For', 'With', 'From', 'Into', 'Out'].includes(name)
    );
  }

  return [];
}

/**
 * Infer mood from scene text
 */
function inferMood(text: string): string {
  const lower = text.toLowerCase();

  const moodKeywords: Record<string, string[]> = {
    happy: ['happy', 'joyful', 'laugh', 'smile', 'cheerful', 'celebrate'],
    sad: ['sad', 'cry', 'tears', 'mourn', 'grief', 'sorrow'],
    tense: ['tense', 'nervous', 'anxious', 'fear', 'dread', 'worry'],
    angry: ['angry', 'furious', 'rage', 'yell', 'scream', 'fight'],
    romantic: ['love', 'romantic', 'kiss', 'embrace', 'passion', 'intimate'],
    mysterious: ['mystery', 'dark', 'shadow', 'secret', 'unknown', 'strange'],
    epic: ['epic', 'hero', 'battle', 'glory', 'victory', 'triumph'],
    peaceful: ['peace', 'calm', 'quiet', 'serene', 'gentle', 'soft'],
    suspenseful: ['suspense', 'thriller', 'danger', 'warning', 'ominous'],
  };

  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return mood;
    }
  }

  return 'neutral';
}
