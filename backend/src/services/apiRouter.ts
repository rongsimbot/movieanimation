/**
 * apiRouter.ts - Smart API Router for Quality vs Cost Optimization
 *
 * Routes scene generation requests to the optimal AI video API based on:
 * - Scene importance/complexity
 * - Quality requirements
 * - Budget constraints
 * - Generation speed needs
 * - Character presence (image-to-video capability)
 */

export type ApiName = 'sora' | 'runway' | 'seedance' | 'luma';

export interface SceneProfile {
  sceneNumber: number;
  description: string;
  importance: 'hero' | 'major' | 'minor' | 'filler';
  complexity: 'high' | 'medium' | 'low';
  hasCharacters: boolean;
  hasCameraMovement: boolean;
  durationEstimate: number;
  requiresHighQuality: boolean;
}

export interface RoutingDecision {
  apiName: ApiName;
  reason: string;
  estimatedCost: number;
  estimatedTime: number; // seconds
  qualityTier: 'standard' | 'high';
}

// ---- API Characteristics ----

interface ApiProfile {
  name: ApiName;
  costPerSecond: number;
  avgGenerationTime: number; // seconds
  maxDuration: number;
  supportsImageToVideo: boolean;
  qualityTier: 'high' | 'medium' | 'low';
  bestFor: string[];
}

const API_PROFILES: Record<ApiName, ApiProfile> = {
  sora: {
    name: 'sora',
    costPerSecond: 0.20, // high quality tier
    avgGenerationTime: 180,
    maxDuration: 10,
    supportsImageToVideo: true,
    qualityTier: 'high',
    bestFor: ['hero scenes', 'emotional close-ups', 'cinematic establishing shots', 'complex narrative moments'],
  },
  runway: {
    name: 'runway',
    costPerSecond: 0.05,
    avgGenerationTime: 120,
    maxDuration: 10,
    supportsImageToVideo: true,
    qualityTier: 'medium',
    bestFor: ['camera movements', 'professional polish', 'character scenes with photos', 'medium complexity scenes'],
  },
  seedance: {
    name: 'seedance',
    costPerSecond: 0.02,
    avgGenerationTime: 60,
    maxDuration: 5,
    supportsImageToVideo: true,
    qualityTier: 'low',
    bestFor: ['volume production', 'social clips', 'filler scenes', 'quick turnarounds', 'budget-constrained projects'],
  },
  luma: {
    name: 'luma',
    costPerSecond: 0.03,
    avgGenerationTime: 90,
    maxDuration: 5,
    supportsImageToVideo: false,
    qualityTier: 'medium',
    bestFor: ['dream-like sequences', 'creative scenes', 'abstract visuals'],
  },
};

// ---- Routing Strategies ----

export interface BudgetConstraints {
  maxCostPerScene?: number;
  maxCostPerProject?: number;
  preferSpeed?: boolean;
  preferQuality?: boolean;
}

type RoutingStrategy = (scene: SceneProfile, budget?: BudgetConstraints) => RoutingDecision;

/**
 * Default quality-first strategy
 */
const qualityFirst: RoutingStrategy = (scene: SceneProfile): RoutingDecision => {
  // Hero scenes always get Sora
  if (scene.importance === 'hero') {
    const api = API_PROFILES.sora;
    return {
      apiName: 'sora',
      reason: 'Hero scene - best quality required',
      estimatedCost: scene.durationEstimate * api.costPerSecond,
      estimatedTime: api.avgGenerationTime,
      qualityTier: 'high',
    };
  }

  // High complexity gets Sora
  if (scene.complexity === 'high') {
    const api = API_PROFILES.sora;
    return {
      apiName: 'sora',
      reason: 'High complexity scene - Sora handles complex prompts best',
      estimatedCost: scene.durationEstimate * api.costPerSecond,
      estimatedTime: api.avgGenerationTime,
      qualityTier: 'high',
    };
  }

  // Camera movement scenes → Runway (best camera control)
  if (scene.hasCameraMovement) {
    const api = API_PROFILES.runway;
    return {
      apiName: 'runway',
      reason: 'Camera movement scene - Runway has best camera control',
      estimatedCost: scene.durationEstimate * api.costPerSecond,
      estimatedTime: api.avgGenerationTime,
      qualityTier: 'standard',
    };
  }

  // Character scenes with medium complexity → Runway
  if (scene.hasCharacters && scene.importance === 'major') {
    const api = API_PROFILES.runway;
    return {
      apiName: 'runway',
      reason: 'Character-focused major scene - Runway image-to-video excels',
      estimatedCost: scene.durationEstimate * api.costPerSecond,
      estimatedTime: api.avgGenerationTime,
      qualityTier: 'standard',
    };
  }

  // Minor scenes → Seedance
  if (scene.importance === 'minor' || scene.importance === 'filler') {
    const api = API_PROFILES.seedance;
    return {
      apiName: 'seedance',
      reason: `${scene.importance} scene - cost-effective Seedance`,
      estimatedCost: Math.min(scene.durationEstimate, api.maxDuration) * api.costPerSecond,
      estimatedTime: api.avgGenerationTime,
      qualityTier: 'standard',
    };
  }

  // Default: medium complexity default → Runway
  const api = API_PROFILES.runway;
  return {
    apiName: 'runway',
    reason: 'Default fallback - balanced quality/cost',
    estimatedCost: scene.durationEstimate * api.costPerSecond,
    estimatedTime: api.avgGenerationTime,
    qualityTier: 'standard',
  };
};

/**
 * Budget-constrained strategy
 */
const budgetOptimized: RoutingStrategy = (scene: SceneProfile, budget?: BudgetConstraints): RoutingDecision => {
  const maxPerScene = budget?.maxCostPerScene ?? Infinity;

  // Hero scenes: use Sora if budget allows, otherwise Runway
  if (scene.importance === 'hero') {
    const soraCost = scene.durationEstimate * API_PROFILES.sora.costPerSecond;
    if (soraCost <= maxPerScene) {
      return {
        apiName: 'sora',
        reason: 'Hero scene within budget - using Sora',
        estimatedCost: soraCost,
        estimatedTime: API_PROFILES.sora.avgGenerationTime,
        qualityTier: 'high',
      };
    }
    // Fallback to Runway
    const runwayCost = scene.durationEstimate * API_PROFILES.runway.costPerSecond;
    return {
      apiName: 'runway',
      reason: `Hero scene over budget ($${soraCost.toFixed(2)} > $${maxPerScene.toFixed(2)}) - using Runway`,
      estimatedCost: runwayCost,
      estimatedTime: API_PROFILES.runway.avgGenerationTime,
      qualityTier: 'standard',
    };
  }

  // Major/high complexity: Runway if budget allows, else Seedance
  if (scene.importance === 'major' || scene.complexity === 'high') {
    const runwayCost = scene.durationEstimate * API_PROFILES.runway.costPerSecond;
    if (runwayCost <= maxPerScene) {
      return {
        apiName: 'runway',
        reason: 'Major scene within budget - using Runway',
        estimatedCost: runwayCost,
        estimatedTime: API_PROFILES.runway.avgGenerationTime,
        qualityTier: 'standard',
      };
    }
    const seedanceCost = Math.min(scene.durationEstimate, 5) * API_PROFILES.seedance.costPerSecond;
    return {
      apiName: 'seedance',
      reason: `Major scene over budget - using Seedance`,
      estimatedCost: seedanceCost,
      estimatedTime: API_PROFILES.seedance.avgGenerationTime,
      qualityTier: 'standard',
    };
  }

  // Everything else → Seedance (cheapest)
  const api = API_PROFILES.seedance;
  return {
    apiName: 'seedance',
    reason: 'Budget optimized - using Seedance',
    estimatedCost: Math.min(scene.durationEstimate, api.maxDuration) * api.costPerSecond,
    estimatedTime: api.avgGenerationTime,
    qualityTier: 'standard',
  };
};

/**
 * Speed-optimized strategy
 */
const speedOptimized: RoutingStrategy = (scene: SceneProfile): RoutingDecision => {
  // Speed-first: always use fastest API = Seedance
  if (scene.importance === 'hero') {
    // Hero still needs quality - use Runway (faster than Sora, acceptable quality)
    return {
      apiName: 'runway',
      reason: 'Speed priority for hero scene - Runway is faster than Sora',
      estimatedCost: scene.durationEstimate * API_PROFILES.runway.costPerSecond,
      estimatedTime: API_PROFILES.runway.avgGenerationTime,
      qualityTier: 'standard',
    };
  }

  // Everything else → Seedance (fastest)
  const api = API_PROFILES.seedance;
  return {
    apiName: 'seedance',
    reason: 'Speed optimized - Seedance is fastest',
    estimatedCost: Math.min(scene.durationEstimate, api.maxDuration) * api.costPerSecond,
    estimatedTime: api.avgGenerationTime,
    qualityTier: 'standard',
  };
};

// ---- Main Router ----

/**
 * Route a scene to the optimal API
 */
export function routeScene(
  scene: SceneProfile,
  budget?: BudgetConstraints
): RoutingDecision {
  // Determine strategy based on budget constraints
  let strategy: RoutingStrategy;

  if (budget?.preferSpeed) {
    strategy = speedOptimized;
  } else if (budget?.maxCostPerScene !== undefined) {
    strategy = budgetOptimized;
  } else if (budget?.preferQuality || scene.requiresHighQuality) {
    strategy = qualityFirst;
  } else {
    strategy = qualityFirst; // default
  }

  const decision = strategy(scene, budget);
  return decision;
}

/**
 * Route multiple scenes and return batch plan with total cost estimate
 */
export function routeBatchScenes(
  scenes: SceneProfile[],
  budget?: BudgetConstraints
): { decisions: RoutingDecision[]; totalEstimatedCost: number; totalEstimatedTime: number } {
  const decisions: RoutingDecision[] = [];
  let totalCost = 0;
  let totalTime = 0;

  for (const scene of scenes) {
    const decision = routeScene(scene, budget);
    decisions.push(decision);
    totalCost += decision.estimatedCost;
    totalTime += decision.estimatedTime;
  }

  return { decisions, totalEstimatedCost: totalCost, totalEstimatedTime: totalTime };
}

/**
 * Get API profile for display
 */
export function getApiProfile(apiName: ApiName): ApiProfile {
  return API_PROFILES[apiName];
}

/**
 * Get all API profiles
 */
export function getAllApiProfiles(): Record<ApiName, ApiProfile> {
  return API_PROFILES;
}
