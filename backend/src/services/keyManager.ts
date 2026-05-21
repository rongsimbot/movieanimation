/**
 * keyManager.ts - API Key Rotation & Management Service
 *
 * Manages pools of API keys with automatic rotation, rate-limit awareness,
 * and health monitoring across Sora, Runway, and Seedance APIs.
 *
 * Features:
 * - Multi-key pools per API provider
 * - Round-robin + least-used rotation strategies
 * - Rate-limit tracking (429 detection)
 * - Key quarantine on repeated failures
 * - Usage statistics per key
 * - Environment variable + database loading
 */

import * as fs from 'fs';
import * as path from 'path';

// ---- Types ----

export type ApiProvider = 'sora' | 'runway' | 'seedance' | 'luma';

export interface ApiKey {
  id: string;
  provider: ApiProvider;
  key: string;
  label?: string;
  active: boolean;
  quarantined: boolean;
  quarantineReason?: string;
  usageCount: number;
  lastUsed?: string;
  rateLimitHits: number;
  consecutiveFailures: number;
  dailyCost: number;
  createdAt: string;
}

export interface KeyPool {
  provider: ApiProvider;
  keys: ApiKey[];
  currentIndex: number;
}

export interface KeyRotationStrategy {
  name: 'round-robin' | 'least-used' | 'weighted';
}

// ---- Key Pools ----

const KEY_POOLS: Map<ApiProvider, KeyPool> = new Map();

const KEY_STORE_PATH = process.env.KEY_STORE_PATH || path.join(__dirname, '../../data/api_keys.json');
const dataDir = path.dirname(KEY_STORE_PATH);

// Ensure data directory
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Initialize key pools from environment and stored config
 */
export function initKeyManager(): void {
  console.log('[KeyManager] Initializing API key pools...');

  // Load stored keys
  let storedKeys: ApiKey[] = [];
  if (fs.existsSync(KEY_STORE_PATH)) {
    try {
      const raw = fs.readFileSync(KEY_STORE_PATH, 'utf-8');
      storedKeys = JSON.parse(raw);
    } catch (err) {
      console.warn('[KeyManager] Could not load stored keys, using env only:', err);
    }
  }

  // Load from environment variables (primary source)
  const envKeys = loadKeysFromEnv();

  // Merge: stored keys + env keys (env keys take priority, deduplicated)
  const mergedKeys = mergeKeyLists(storedKeys, envKeys);

  // Build pools
  for (const provider of ['sora', 'runway', 'seedance', 'luma'] as ApiProvider[]) {
    const providerKeys = mergedKeys.filter(k => k.provider === provider && k.active && !k.quarantined);
    KEY_POOLS.set(provider, {
      provider,
      keys: providerKeys,
      currentIndex: 0,
    });
    console.log(`[KeyManager] ${provider}: ${providerKeys.length} active keys`);
  }

  // Persist merged keys
  persistKeys(mergedKeys);

  console.log('[KeyManager] Initialization complete');
}

/**
 * Load keys from environment variables
 * Supports:
 * - OPENAI_API_KEY (sora single key)
 * - OPENAI_API_KEY_2, OPENAI_API_KEY_3 (sora rotation)
 * - RUNWAY_API_KEY (runway single key)
 * - RUNWAY_API_KEY_2, RUNWAY_API_KEY_3 (runway rotation)
 * - SEEDANCE_API_KEY (seedance single key)
 * - SEEDANCE_API_KEY_2, SEEDANCE_API_KEY_3 (seedance rotation)
 * - LUMA_API_KEY (luma single key)
 */
function loadKeysFromEnv(): ApiKey[] {
  const keys: ApiKey[] = [];
  const now = new Date().toISOString();

  // Sora (OpenAI) keys
  const openaiPrimary = process.env.OPENAI_API_KEY;
  if (openaiPrimary) {
    keys.push(createKeyEntry('sora', openaiPrimary, 'primary', now));
  }
  for (let i = 2; i <= 5; i++) {
    const key = process.env[`OPENAI_API_KEY_${i}`];
    if (key) {
      keys.push(createKeyEntry('sora', key, `secondary-${i}`, now));
    }
  }

  // Runway keys
  const runwayPrimary = process.env.RUNWAY_API_KEY;
  if (runwayPrimary) {
    keys.push(createKeyEntry('runway', runwayPrimary, 'primary', now));
  }
  for (let i = 2; i <= 5; i++) {
    const key = process.env[`RUNWAY_API_KEY_${i}`];
    if (key) {
      keys.push(createKeyEntry('runway', key, `secondary-${i}`, now));
    }
  }

  // Seedance keys
  const seedancePrimary = process.env.SEEDANCE_API_KEY;
  if (seedancePrimary) {
    keys.push(createKeyEntry('seedance', seedancePrimary, 'primary', now));
  }
  for (let i = 2; i <= 5; i++) {
    const key = process.env[`SEEDANCE_API_KEY_${i}`];
    if (key) {
      keys.push(createKeyEntry('seedance', key, `secondary-${i}`, now));
    }
  }

  // Luma keys
  const lumaPrimary = process.env.LUMA_API_KEY;
  if (lumaPrimary) {
    keys.push(createKeyEntry('luma', lumaPrimary, 'primary', now));
  }

  return keys;
}

function createKeyEntry(provider: ApiProvider, key: string, label: string, now: string): ApiKey {
  return {
    id: `${provider}-${label}-${Date.now()}`,
    provider,
    key,
    label,
    active: true,
    quarantined: false,
    usageCount: 0,
    rateLimitHits: 0,
    consecutiveFailures: 0,
    dailyCost: 0,
    createdAt: now,
  };
}

function mergeKeyLists(stored: ApiKey[], env: ApiKey[]): ApiKey[] {
  const merged: ApiKey[] = [...stored];
  for (const envKey of env) {
    const existing = merged.find(k => k.provider === envKey.provider && k.key === envKey.key);
    if (!existing) {
      merged.push(envKey);
    } else {
      // Refresh from env
      existing.active = true;
      existing.quarantined = false;
    }
  }
  return merged;
}

function persistKeys(keys: ApiKey[]): void {
  try {
    fs.writeFileSync(KEY_STORE_PATH, JSON.stringify(keys, null, 2), 'utf-8');
  } catch (err) {
    console.error('[KeyManager] Failed to persist keys:', err);
  }
}

// ---- Key Rotation ----

let rotationStrategy: KeyRotationStrategy = { name: 'least-used' };

export function setRotationStrategy(strategy: KeyRotationStrategy): void {
  rotationStrategy = strategy;
  console.log(`[KeyManager] Rotation strategy: ${strategy.name}`);
}

/**
 * Get the next available API key for a provider
 * Uses configured rotation strategy, skips quarantined keys
 */
export function getApiKey(provider: ApiProvider): string {
  const pool = KEY_POOLS.get(provider);
  if (!pool || pool.keys.length === 0) {
    throw new Error(`No active API keys available for ${provider}. Add ${getEnvVarName(provider)} to .env`);
  }

  const activeKeys = pool.keys.filter(k => k.active && !k.quarantined);
  if (activeKeys.length === 0) {
    throw new Error(`All API keys for ${provider} are quarantined or inactive. Check key health.`);
  }

  let selectedKey: ApiKey;

  switch (rotationStrategy.name) {
    case 'least-used':
      // Pick key with lowest usage count
      activeKeys.sort((a, b) => a.usageCount - b.usageCount);
      selectedKey = activeKeys[0];
      break;

    case 'weighted':
      // Weight by inverse of failure rate
      activeKeys.sort((a, b) => {
        const aScore = a.usageCount > 0 ? 1 - (a.consecutiveFailures / a.usageCount) : 1;
        const bScore = b.usageCount > 0 ? 1 - (b.consecutiveFailures / b.usageCount) : 1;
        return bScore - aScore; // Higher score first
      });
      selectedKey = activeKeys[0];
      break;

    case 'round-robin':
    default:
      // Classic round-robin through active keys
      const activeInPool = pool.keys.filter(k => k.active && !k.quarantined);
      const activeIndex = activeInPool.indexOf(pool.keys[pool.currentIndex % pool.keys.length]);
      if (activeIndex >= 0) {
        selectedKey = activeInPool[activeIndex];
      } else {
        selectedKey = activeInPool[0];
      }
      pool.currentIndex = (pool.currentIndex + 1) % pool.keys.length;
      break;
  }

  // Update usage stats
  selectedKey.usageCount++;
  selectedKey.lastUsed = new Date().toISOString();

  return selectedKey.key;
}

/**
 * Mark a key as rate-limited
 * Triggers automatic rotation away from this key
 */
export function markKeyRateLimited(provider: ApiProvider, key: string): void {
  const pool = KEY_POOLS.get(provider);
  if (!pool) return;

  const keyEntry = pool.keys.find(k => k.key === key);
  if (!keyEntry) return;

  keyEntry.rateLimitHits++;
  keyEntry.consecutiveFailures++;

  console.warn(`[KeyManager] ${provider} key ${keyEntry.label} rate limited (${keyEntry.rateLimitHits} hits)`);

  // Quarantine if too many rate limits hit
  if (keyEntry.rateLimitHits >= 3) {
    quarantineKey(provider, keyEntry, 'Excessive rate limit hits');
  }

  persistKeysFromPools();
}

/**
 * Mark a key as failed (auth error, fatal response)
 */
export function markKeyFailed(provider: ApiProvider, key: string, reason: string): void {
  const pool = KEY_POOLS.get(provider);
  if (!pool) return;

  const keyEntry = pool.keys.find(k => k.key === key);
  if (!keyEntry) return;

  keyEntry.consecutiveFailures++;
  keyEntry.rateLimitHits++;

  console.warn(`[KeyManager] ${provider} key ${keyEntry.label} failed: ${reason}`);

  // Immediately quarantine on auth failures
  if (reason.includes('auth') || reason.includes('401') || reason.includes('403')) {
    quarantineKey(provider, keyEntry, `Auth failure: ${reason}`);
  } else if (keyEntry.consecutiveFailures >= 5) {
    quarantineKey(provider, keyEntry, `${keyEntry.consecutiveFailures} consecutive failures`);
  }

  persistKeysFromPools();
}

/**
 * Mark a key as successful (resets failure counter)
 */
export function markKeySuccess(provider: ApiProvider, key: string, cost: number = 0): void {
  const pool = KEY_POOLS.get(provider);
  if (!pool) return;

  const keyEntry = pool.keys.find(k => k.key === key);
  if (!keyEntry) return;

  keyEntry.consecutiveFailures = 0;
  keyEntry.dailyCost += cost;

  // Auto-unquarantine if it was quarantined for rate limits
  if (keyEntry.quarantined && keyEntry.quarantineReason?.includes('rate limit')) {
    const quarantineTime = keyEntry.lastUsed ? Date.now() - new Date(keyEntry.lastUsed).getTime() : Infinity;
    if (quarantineTime > 300000) { // 5 minutes
      unquarantineKey(provider, keyEntry);
    }
  }
}

/**
 * Quarantine a key (temporarily disable)
 */
function quarantineKey(provider: ApiProvider, keyEntry: ApiKey, reason: string): void {
  if (keyEntry.quarantined) return;

  keyEntry.quarantined = true;
  keyEntry.quarantineReason = reason;
  console.warn(`[KeyManager] 🔒 Quarantined ${provider} key ${keyEntry.label}: ${reason}`);

  // Schedule auto-recovery after 15 minutes
  setTimeout(() => {
    if (keyEntry.quarantined && keyEntry.quarantineReason?.includes('rate limit')) {
      unquarantineKey(provider, keyEntry);
    }
  }, 900000); // 15 minutes
}

/**
 * Unquarantine a key
 */
function unquarantineKey(provider: ApiProvider, keyEntry: ApiKey): void {
  keyEntry.quarantined = false;
  keyEntry.quarantineReason = undefined;
  keyEntry.consecutiveFailures = Math.max(0, keyEntry.consecutiveFailures - 2);
  keyEntry.rateLimitHits = Math.max(0, keyEntry.rateLimitHits - 1);
  console.log(`[KeyManager] 🔓 Unquarantined ${provider} key ${keyEntry.label}`);
}

/**
 * Get all pools (for admin endpoints)
 */
export function getKeyPools(): Map<ApiProvider, KeyPool> {
  return KEY_POOLS;
}

/**
 * Get pool stats for a provider
 */
export function getPoolStats(provider?: ApiProvider): any {
  if (provider) {
    const pool = KEY_POOLS.get(provider);
    if (!pool) return null;
    return {
      provider,
      totalKeys: pool.keys.length,
      activeKeys: pool.keys.filter(k => k.active).length,
      quarantinedKeys: pool.keys.filter(k => k.quarantined).length,
      totalUsage: pool.keys.reduce((sum, k) => sum + k.usageCount, 0),
      totalCost: pool.keys.reduce((sum, k) => sum + k.dailyCost, 0),
      keys: pool.keys.map(k => ({
        id: k.id,
        label: k.label,
        active: k.active,
        quarantined: k.quarantined,
        usageCount: k.usageCount,
        rateLimitHits: k.rateLimitHits,
        consecutiveFailures: k.consecutiveFailures,
        dailyCost: k.dailyCost,
        lastUsed: k.lastUsed,
        quarantineReason: k.quarantineReason,
      })),
    };
  }

  const stats: any[] = [];
  for (const [provider, pool] of KEY_POOLS.entries()) {
    stats.push({
      provider,
      totalKeys: pool.keys.length,
      activeKeys: pool.keys.filter(k => k.active).length,
      quarantinedKeys: pool.keys.filter(k => k.quarantined).length,
      totalUsage: pool.keys.reduce((sum, k) => sum + k.usageCount, 0),
    });
  }
  return stats;
}

/**
 * Add a new API key at runtime
 */
export function addApiKey(provider: ApiProvider, key: string, label?: string): ApiKey {
  const pool = KEY_POOLS.get(provider);
  const newKey = createKeyEntry(provider, key, label || `runtime-${Date.now()}`, new Date().toISOString());

  if (!pool) {
    KEY_POOLS.set(provider, {
      provider,
      keys: [newKey],
      currentIndex: 0,
    });
  } else {
    pool.keys.push(newKey);
  }

  persistKeysFromPools();
  console.log(`[KeyManager] ✅ Added new ${provider} key: ${newKey.label}`);
  return newKey;
}

/**
 * Remove a key by ID
 */
export function removeApiKey(keyId: string): boolean {
  for (const [provider, pool] of KEY_POOLS.entries()) {
    const idx = pool.keys.findIndex(k => k.id === keyId);
    if (idx >= 0) {
      pool.keys.splice(idx, 1);
      persistKeysFromPools();
      console.log(`[KeyManager] 🗑️ Removed key ${keyId} from ${provider}`);
      return true;
    }
  }
  return false;
}

/**
 * Reset daily costs (call at midnight)
 */
export function resetDailyCosts(): void {
  for (const pool of KEY_POOLS.values()) {
    for (const key of pool.keys) {
      key.dailyCost = 0;
    }
  }
  console.log('[KeyManager] Daily costs reset');
}

// ---- Helpers ----

function getEnvVarName(provider: ApiProvider): string {
  const map: Record<ApiProvider, string> = {
    sora: 'OPENAI_API_KEY',
    runway: 'RUNWAY_API_KEY',
    seedance: 'SEEDANCE_API_KEY',
    luma: 'LUMA_API_KEY',
  };
  return map[provider];
}

function persistKeysFromPools(): void {
  const allKeys: ApiKey[] = [];
  for (const pool of KEY_POOLS.values()) {
    allKeys.push(...pool.keys);
  }
  persistKeys(allKeys);
}

// ---- Scheduled Maintenance ----

// Reset daily costs at midnight
function scheduleMidnightReset(): void {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight.getTime() - now.getTime();

  setTimeout(() => {
    resetDailyCosts();
    // Schedule next reset
    setInterval(() => resetDailyCosts(), 86400000); // Every 24 hours
  }, msUntilMidnight);
}

// Auto-init on import
initKeyManager();
scheduleMidnightReset();
