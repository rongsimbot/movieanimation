/**
 * Phase 6: Prompt Engineering Pipeline
 * Enhances user scripts into AI-friendly video generation prompts
 *
 * Transforms scene descriptions into cinematic, detailed prompts
 * optimized for Sora 2, Runway Gen-3, Luma Dream Machine, and Seedance.
 */

import { GoogleGenAI } from "@google/genai";

export interface PromptContext {
  sceneDescription: string;
  sceneAction: string;
  characters?: Array<{
    name: string;
    description: string;
    visual_description?: string;
    image_url?: string;
  }>;
  setting?: string;
  mood?: string;
  style?: string;
  duration?: number;
  genre?: string;
}

export interface EnhancedPrompt {
  prompt: string;
  negativePrompt?: string;
  style: string;
  estimatedDuration: number;
  complexity: 'simple' | 'moderate' | 'complex';
  characterCount: number;
  hasAction: boolean;
  estimatedCost: number;
}

export interface SceneAnalysis {
  sceneType: 'establishing' | 'dialogue' | 'action' | 'closeup' | 'transition';
  suggestedApi: 'sora' | 'runway' | 'luma' | 'seedance';
  confidence: number;
  requiresCharacterInjection: boolean;
  motionLevel: 'static' | 'subtle' | 'moderate' | 'intense';
  lightingType: string;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Cost estimates per second per API (USD)
const API_COST_PER_SEC: Record<string, number> = {
  sora: 0.20,      // $0.20/sec (high quality)
  runway: 0.12,    // $0.12/sec
  luma: 0.08,      // $0.08/sec
  seedance: 0.05,  // $0.05/sec (budget option)
};

/**
 * Analyze a scene to determine the best API for generation.
 */
export function analyzeScene(context: PromptContext): SceneAnalysis {
  const { sceneDescription, sceneAction, characters, mood } = context;
  const fullText = `${sceneDescription || ""} ${sceneAction || ""}`.toLowerCase();

  // Scene type detection
  let sceneType: SceneAnalysis['sceneType'] = 'dialogue';
  let motionLevel: SceneAnalysis['motionLevel'] = 'subtle';

  if (fullText.match(/establishing|wide.*shot|exterior|landscape|cityscape|aerial|drone/)) {
    sceneType = 'establishing';
    motionLevel = 'subtle';
  } else if (fullText.match(/action|fight|chase|explos|running|battle|combat|fast|dynamic/)) {
    sceneType = 'action';
    motionLevel = 'intense';
  } else if (fullText.match(/close[- ]?up|face|expression|emotion|intimate|tight.*shot/)) {
    sceneType = 'closeup';
    motionLevel = 'static';
  } else if (fullText.match(/transition|fade|cut|dissolve|montage/)) {
    sceneType = 'transition';
    motionLevel = 'moderate';
  }

  // Lighting detection
  let lightingType = 'natural';
  if (fullText.match(/night|dark|shadow|noir|moonlight|dim/)) lightingType = 'dark';
  else if (fullText.match(/sunset|golden hour|sunrise|warm/)) lightingType = 'warm';
  else if (fullText.match(/neon|fluorescent|harsh|bright|studio/)) lightingType = 'artificial';
  else if (fullText.match(/overcast|fog|mist|rain|storm/)) lightingType = 'moody';

  // Smart API routing logic
  let suggestedApi: SceneAnalysis['suggestedApi'] = 'sora';
  let confidence = 0.7;

  const hasCharacters = characters && characters.length > 0;

  switch (sceneType) {
    case 'establishing':
      suggestedApi = 'luma';
      confidence = 0.8;
      break;
    case 'action':
      suggestedApi = 'runway';
      confidence = 0.85;
      break;
    case 'closeup':
      suggestedApi = hasCharacters ? 'sora' : 'runway';
      confidence = hasCharacters ? 0.9 : 0.75;
      break;
    case 'dialogue':
      suggestedApi = hasCharacters ? 'sora' : 'luma';
      confidence = hasCharacters ? 0.85 : 0.7;
      break;
    case 'transition':
      suggestedApi = 'seedance';
      confidence = 0.6;
      break;
  }

  return {
    sceneType,
    suggestedApi,
    confidence,
    requiresCharacterInjection: hasCharacters,
    motionLevel,
    lightingType,
  };
}

/**
 * Enhance a scene description into a cinematic prompt optimized for video generation.
 */
export async function enhancePrompt(context: PromptContext): Promise<EnhancedPrompt> {
  const analysis = analyzeScene(context);
  const api = analysis.suggestedApi;

  // Character descriptions
  const characterDetails = (context.characters || [])
    .map(c => c.visual_description || c.description || c.name)
    .join(". ");

  // Build the enhanced prompt with AI if Gemini is available
  let enhancedPromptText: string;

  if (process.env.GEMINI_API_KEY) {
    try {
      const promptRequest = `You are a professional cinematic prompt engineer for AI video generation (${api.toUpperCase()} API).
Convert this scene into a single, highly detailed, cinematic video generation prompt (maximum 500 characters):

SCENE DETAILS:
- Description: ${context.sceneDescription || "N/A"}
- Action: ${context.sceneAction || "N/A"}
- Setting: ${context.setting || "Not specified"}
- Mood: ${context.mood || "Not specified"}
- Characters: ${characterDetails || "None"}
- Genre: ${context.genre || "cinematic"}
- Style preference: ${context.style || "cinematic"}

Scene Analysis:
- Type: ${analysis.sceneType}
- Motion Level: ${analysis.motionLevel}
- Lighting: ${analysis.lightingType}

FORMAT: Return ONLY the enhanced prompt text (no JSON, no explanation). The prompt should be:
1. Visual and descriptive (what we SEE, not story)
2. Include camera direction, lighting, composition
3. Cinematic terminology (wide shot, close-up, dolly, etc.)
4. Under 500 characters
5. Optimized for ${api} video generation API

Return ONLY the prompt text.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: promptRequest,
      });

      enhancedPromptText = (response.text || "").trim().slice(0, 500);

      // Fallback if AI returns empty or too short
      if (enhancedPromptText.length < 50) {
        enhancedPromptText = buildTemplatePrompt(context, analysis);
      }
    } catch {
      enhancedPromptText = buildTemplatePrompt(context, analysis);
    }
  } else {
    enhancedPromptText = buildTemplatePrompt(context, analysis);
  }

  // Cost estimation
  const duration = context.duration || (analysis.sceneType === 'action' ? 8 : 5);
  const costPerSec = API_COST_PER_SEC[api] || 0.10;
  const estimatedCost = duration * costPerSec;

  // Complexity
  let complexity: EnhancedPrompt['complexity'] = 'simple';
  if (analysis.motionLevel === 'intense' && (context.characters?.length || 0) > 1) {
    complexity = 'complex';
  } else if (analysis.motionLevel === 'moderate' || (context.characters?.length || 0) > 0) {
    complexity = 'moderate';
  }

  return {
    prompt: enhancedPromptText,
    negativePrompt: buildNegativePrompt(analysis),
    style: context.style || 'cinematic',
    estimatedDuration: duration,
    complexity,
    characterCount: (context.characters || []).length,
    hasAction: analysis.sceneType === 'action',
    estimatedCost: Math.round(estimatedCost * 10000) / 10000,
  };
}

/**
 * Build a template-based enhanced prompt (fallback when AI unavailable).
 */
function buildTemplatePrompt(context: PromptContext, analysis: SceneAnalysis): string {
  const parts: string[] = [];

  // Scene type prefix
  switch (analysis.sceneType) {
    case 'establishing':
      parts.push("Wide establishing shot");
      break;
    case 'closeup':
      parts.push("Cinematic close-up shot");
      break;
    case 'action':
      parts.push("Dynamic action sequence");
      break;
    case 'transition':
      parts.push("Smooth transition scene");
      break;
    default:
      parts.push("Cinematic medium shot");
  }

  // Characters
  const chars = (context.characters || [])
    .map(c => c.visual_description || c.description || c.name)
    .filter(Boolean);
  if (chars.length > 0) {
    parts.push(`of ${chars.join(" and ")}`);
  }

  // Action
  if (context.sceneAction) {
    parts.push(context.sceneAction.slice(0, 100));
  }

  // Setting
  if (context.setting) {
    parts.push(`in ${context.setting}`);
  } else if (context.sceneDescription) {
    parts.push(context.sceneDescription.slice(0, 80));
  }

  // Cinematic quality markers
  const qualityMarkers = getQualityMarkers(analysis);
  parts.push(qualityMarkers);

  // Mood
  if (context.mood) {
    parts.push(`${context.mood} atmosphere`);
  }

  return parts.join(", ").slice(0, 500);
}

/**
 * Get quality markers based on scene analysis.
 */
function getQualityMarkers(analysis: SceneAnalysis): string {
  const markers: string[] = ["4K quality", "cinematic composition"];

  switch (analysis.lightingType) {
    case 'dark': markers.push("low-key dramatic lighting", "atmospheric shadows"); break;
    case 'warm': markers.push("warm golden hour lighting"); break;
    case 'artificial': markers.push("neon accent lighting", "cyberpunk aesthetic"); break;
    case 'moody': markers.push("volumetric fog", "atmospheric haze"); break;
    default: markers.push("natural lighting");
  }

  switch (analysis.motionLevel) {
    case 'static': markers.push("steady camera"); break;
    case 'subtle': markers.push("subtle camera drift"); break;
    case 'moderate': markers.push("smooth tracking shot"); break;
    case 'intense': markers.push("dynamic camera movement", "motion blur"); break;
  }

  return markers.join(", ");
}

/**
 * Build negative prompt to avoid common generation issues.
 */
function buildNegativePrompt(analysis: SceneAnalysis): string {
  const negatives = [
    "blurry", "low quality", "watermark", "text overlay",
    "distorted faces", "extra limbs", "morphing",
  ];

  return negatives.join(", ");
}

/**
 * Inject character face references into a prompt.
 * Returns the enhanced prompt with character visual descriptions.
 */
export function injectCharacterFaces(
  prompt: string,
  characters: Array<{ name: string; description: string; image_url?: string }>
): string {
  if (!characters || characters.length === 0) return prompt;

  const characterVisuals = characters
    .map(c => {
      const parts = [c.description];
      if (c.image_url) {
        parts.push(`matching the reference image`);
      }
      return parts.join(", ");
    })
    .join(". ");

  // Insert character descriptions near the beginning
  const enhanced = `Featuring ${characterVisuals}. ${prompt}`;
  return enhanced.slice(0, 500);
}

/**
 * Smart Router: Select the best API for a given scene.
 */
export function smartRouteApi(context: PromptContext, availableApis: string[] = ['sora', 'runway', 'luma', 'seedance']): {
  primary: string;
  fallback: string;
  reason: string;
} {
  const analysis = analyzeScene(context);
  const primary = analysis.suggestedApi;

  // Find a fallback that's available
  const fallbacks = availableApis.filter(a => a !== primary);
  const fallback = fallbacks[0] || primary;

  let reason = `Scene type "${analysis.sceneType}" with motion level "${analysis.motionLevel}" → ${primary}`;

  // Override for specific cases
  if (context.mood === 'intense' || context.mood === 'dramatic') {
    reason += ' (dramatic scenes benefit from Sora quality)';
  } else if (analysis.motionLevel === 'static' && analysis.sceneType === 'dialogue') {
    reason += ' (static dialogue scenes can use budget APIs)';
  }

  return { primary, fallback, reason };
}

/**
 * Estimate cost for a batch of scenes.
 */
export function estimateBatchCost(scenes: Array<{ duration?: number; analysis?: SceneAnalysis }>): {
  totalCost: number;
  perScene: Array<{ index: number; api: string; cost: number }>;
} {
  let totalCost = 0;
  const perScene: Array<{ index: number; api: string; cost: number }> = [];

  scenes.forEach((scene, index) => {
    const api = scene.analysis?.suggestedApi || 'luma';
    const duration = scene.duration || 5;
    const rate = API_COST_PER_SEC[api] || 0.10;
    const cost = Math.round(duration * rate * 10000) / 10000;

    totalCost += cost;
    perScene.push({ index, api, cost });
  });

  return { totalCost: Math.round(totalCost * 100) / 100, perScene };
}

export default {
  analyzeScene,
  enhancePrompt,
  injectCharacterFaces,
  smartRouteApi,
  estimateBatchCost,
  API_COST_PER_SEC,
};
