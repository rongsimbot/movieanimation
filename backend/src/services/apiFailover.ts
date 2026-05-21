/**
 * apiFailover.ts - Cross-API Failover & Circuit Breaker Service
 *
 * Handles automatic failover between video generation APIs when one fails.
 * Uses circuit breaker pattern to temporarily disable failing APIs.
 *
 * Features:
 * - Automatic failover: Sora → Runway → Seedance → Luma
 * - Circuit breaker: opens after N failures, auto-closes after cooldown
 * - Failure rate tracking per API
 * - Configurable failover chains
 * - Quality degradation awareness (warn when falling back to lower quality)
 */

import { ApiProvider } from './keyManager';
import { markKeyFailed } from './keyManager';

// ---- Types ----

export type FailoverStrategy = 'quality-first' | 'cost-first' | 'speed-first';

export interface FailoverConfig {
  strategy: FailoverStrategy;
  circuitBreaker: {
    failureThreshold: number; // Open circuit after N consecutive failures
    cooldownMs: number;       // Time before attempting to close circuit
    halfOpenMaxAttempts: number; // Max requests in half-open state
  };
}

export interface FailoverResult {
  success: boolean;
  apiUsed: ApiProvider;
  previousFailures: ApiProvider[];
  qualityDegraded: boolean;
  message: string;
}

export interface CircuitState {
  provider: ApiProvider;
  state: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailure?: string;
  lastSuccess?: string;
  openedAt?: string;
  halfOpenAttempts: number;
}

// ---- Default Config ----

const DEFAULT_CONFIG: FailoverConfig = {
  strategy: 'quality-first',
  circuitBreaker: {
    failureThreshold: 3,
    cooldownMs: 120000, // 2 minutes
    halfOpenMaxAttempts: 2,
  },
};

let activeConfig: FailoverConfig = { ...DEFAULT_CONFIG };

// ---- Circuit States ----

const circuits: Map<ApiProvider, CircuitState> = new Map();

function getOrCreateCircuit(provider: ApiProvider): CircuitState {
  if (!circuits.has(provider)) {
    circuits.set(provider, {
      provider,
      state: 'closed',
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      halfOpenAttempts: 0,
    });
  }
  return circuits.get(provider)!;
}

// ---- Failover Chains ----

/**
 * Returns the failover priority chain based on strategy
 * Earlier in array = higher priority
 */
export function getFailoverChain(strategy?: FailoverStrategy): ApiProvider[] {
  const strat = strategy || activeConfig.strategy;

  switch (strat) {
    case 'quality-first':
      return ['sora', 'runway', 'seedance', 'luma'];
    case 'cost-first':
      return ['seedance', 'luma', 'runway', 'sora'];
    case 'speed-first':
      return ['seedance', 'runway', 'luma', 'sora'];
    default:
      return ['sora', 'runway', 'seedance', 'luma'];
  }
}

// ---- Circuit Breaker Logic ----

/**
 * Check if an API circuit is open (temporarily blocked)
 */
export function isCircuitOpen(provider: ApiProvider): boolean {
  const circuit = getOrCreateCircuit(provider);

  if (circuit.state === 'open') {
    const openedMs = circuit.openedAt ? Date.now() - new Date(circuit.openedAt).getTime() : 0;
    if (openedMs >= activeConfig.circuitBreaker.cooldownMs) {
      // Cooldown expired → transition to half-open
      circuit.state = 'half-open';
      circuit.halfOpenAttempts = 0;
      console.log(`[Failover] 🔶 ${provider} circuit: open → half-open (cooldown expired)`);
      return false;
    }
    return true;
  }

  if (circuit.state === 'half-open') {
    return circuit.halfOpenAttempts >= activeConfig.circuitBreaker.halfOpenMaxAttempts;
  }

  return false; // closed
}

/**
 * Report a successful API call to the circuit breaker
 */
export function reportSuccess(provider: ApiProvider, apiKey?: string): void {
  const circuit = getOrCreateCircuit(provider);
  circuit.consecutiveFailures = 0;

  if (circuit.state === 'half-open') {
    circuit.halfOpenAttempts++;
    if (circuit.halfOpenAttempts >= activeConfig.circuitBreaker.halfOpenMaxAttempts) {
      // Fully recovered
      circuit.state = 'closed';
      console.log(`[Failover] ✅ ${provider} circuit: half-open → closed (recovered)`);
    }
  }

  circuit.totalSuccesses++;
  circuit.lastSuccess = new Date().toISOString();
}

/**
 * Report a failed API call to the circuit breaker
 */
export function reportFailure(provider: ApiProvider, errorMessage: string, apiKey?: string): void {
  const circuit = getOrCreateCircuit(provider);
  circuit.consecutiveFailures++;
  circuit.totalFailures++;
  circuit.lastFailure = new Date().toISOString();

  if (apiKey) {
    markKeyFailed(provider, apiKey, errorMessage);
  }

  if (circuit.state === 'half-open') {
    // Failed in half-open → re-open
    circuit.state = 'open';
    circuit.openedAt = new Date().toISOString();
    console.warn(`[Failover] 🔴 ${provider} circuit: half-open → open (failed in test)`);
  } else if (circuit.consecutiveFailures >= activeConfig.circuitBreaker.failureThreshold) {
    // Open the circuit
    circuit.state = 'open';
    circuit.openedAt = new Date().toISOString();
    console.warn(`[Failover] 🔴 ${provider} circuit: closed → open (${circuit.consecutiveFailures} failures)`);
  }
}

/**
 * Force reset a circuit (admin override)
 */
export function resetCircuit(provider: ApiProvider): void {
  const circuit = getOrCreateCircuit(provider);
  circuit.state = 'closed';
  circuit.consecutiveFailures = 0;
  circuit.halfOpenAttempts = 0;
  circuit.openedAt = undefined;
  console.log(`[Failover] 🔄 ${provider} circuit manually reset to closed`);
}

// ---- Failover Execution ----

export type ApiCallFn<T> = (provider: ApiProvider) => Promise<T>;

export interface FailoverAttempt {
  provider: ApiProvider;
  success: boolean;
  error?: string;
  result?: any;
}

/**
 * Execute an API call with automatic failover
 * Tries providers in order, skipping open circuits, until one succeeds
 */
export async function executeWithFailover<T>(
  preferredProvider: ApiProvider,
  apiCall: ApiCallFn<T>,
  options?: {
    strategy?: FailoverStrategy;
    allowQualityDegradation?: boolean;
    onFailover?: (from: ApiProvider, to: ApiProvider, reason: string) => void;
  }
): Promise<{ result: T; failover: FailoverResult; attempts: FailoverAttempt[] }> {
  const chain = getFailoverChain(options?.strategy);
  const attempts: FailoverAttempt[] = [];
  const previousFailures: ApiProvider[] = [];
  let qualityDegraded = false;

  // Reorder chain to start with preferred provider
  const orderedChain = [
    preferredProvider,
    ...chain.filter(p => p !== preferredProvider),
  ];

  let lastError: Error | null = null;

  for (let i = 0; i < orderedChain.length; i++) {
    const provider = orderedChain[i];

    // Skip open circuits unless it's the last resort
    if (isCircuitOpen(provider) && i < orderedChain.length - 1) {
      console.log(`[Failover] ⏭️ Skipping ${provider} (circuit open)`);
      attempts.push({ provider, success: false, error: 'Circuit open' });
      continue;
    }

    try {
      console.log(`[Failover] 🎯 Attempting ${provider}${i > 0 ? ` (fallback #${i})` : ''}`);
      const result = await apiCall(provider);

      // Success!
      reportSuccess(provider);
      attempts.push({ provider, success: true, result });

      if (i > 0 && options?.onFailover) {
        options.onFailover(preferredProvider, provider, previousFailures.map((p, j) =>
          `${p}: ${attempts[j]?.error}`
        ).join('; '));
      }

      return {
        result,
        failover: {
          success: true,
          apiUsed: provider,
          previousFailures,
          qualityDegraded,
          message: i === 0
            ? `${provider} (primary)`
            : `Fell back to ${provider} after ${previousFailures.join(', ')} failed`,
        },
        attempts,
      };
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      lastError = error;

      console.error(`[Failover] ❌ ${provider} failed: ${errorMsg}`);
      reportFailure(provider, errorMsg);
      previousFailures.push(provider);
      attempts.push({ provider, success: false, error: errorMsg });

      if (i === 0 && orderedChain.length > 1) {
        qualityDegraded = true;
        console.warn(`[Failover] ⚠️ Quality degraded: ${preferredProvider} → ${orderedChain[1]}`);
      }
    }
  }

  // All providers failed
  return {
    result: null as any,
    failover: {
      success: false,
      apiUsed: orderedChain[0],
      previousFailures,
      qualityDegraded,
      message: `All APIs failed: ${previousFailures.join(', ')}`,
    },
    attempts,
  };
}

// ---- Smart API Selection ----

export interface SceneRequirements {
  importance: 'hero' | 'major' | 'minor' | 'filler';
  complexity: 'high' | 'medium' | 'low';
  hasCharacters: boolean;
  hasCameraMovement: boolean;
  needsImageToVideo: boolean;
  maxBudget?: number;
}

/**
 * Select the best API for a scene, considering circuit states
 */
export function selectBestApi(reqs: SceneRequirements): ApiProvider {
  const chain = getFailoverChain();

  for (const provider of chain) {
    if (isCircuitOpen(provider)) continue;

    // Filter by capability
    if (reqs.needsImageToVideo && provider === 'luma') continue; // Luma doesn't support i2v

    return provider;
  }

  // All open? Use first available
  return chain[0];
}

// ---- Configuration ----

export function setFailoverConfig(config: Partial<FailoverConfig>): void {
  activeConfig = { ...activeConfig, ...config };
}

export function getFailoverConfig(): FailoverConfig {
  return { ...activeConfig };
}

export function getCircuitStates(): Record<string, CircuitState> {
  const states: Record<string, CircuitState> = {};
  for (const [provider, circuit] of circuits.entries()) {
    states[provider] = { ...circuit };
  }
  return states;
}

// ---- Health Check ----

/**
 * Get failover health summary
 */
export function getFailoverHealth(): {
  availableApis: ApiProvider[];
  degradedApis: ApiProvider[];
  unavailableApis: ApiProvider[];
  stats: Record<string, { successRate: number; opens: number }>;
} {
  const available: ApiProvider[] = [];
  const degraded: ApiProvider[] = [];
  const unavailable: ApiProvider[] = [];

  for (const [provider, circuit] of circuits.entries()) {
    if (circuit.state === 'closed') available.push(provider);
    else if (circuit.state === 'half-open') degraded.push(provider);
    else unavailable.push(provider);
  }

  // Also consider providers without circuits as available
  for (const provider of ['sora', 'runway', 'seedance', 'luma'] as ApiProvider[]) {
    if (!circuits.has(provider)) available.push(provider);
  }

  const stats: Record<string, any> = {};
  for (const [provider, circuit] of circuits.entries()) {
    const total = circuit.totalSuccesses + circuit.totalFailures;
    stats[provider] = {
      successRate: total > 0 ? Math.round((circuit.totalSuccesses / total) * 100) : 100,
      opens: circuit.state === 'open' ? 1 : 0,
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
    };
  }

  return {
    availableApis: [...new Set(available)],
    degradedApis: [...new Set(degraded)],
    unavailableApis: [...new Set(unavailable)],
    stats,
  };
}
