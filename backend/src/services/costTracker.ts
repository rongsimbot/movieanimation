/**
 * costTracker.ts - API Cost Tracking Service
 *
 * Tracks all video generation costs per user, project, and API.
 * Supports budget limits, alerts, and usage reporting.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---- Types ----

export interface CostEntry {
  timestamp: string;
  apiName: string;
  userId?: string;
  projectId?: string;
  sceneId?: string;
  creditsUsed: number;
  cost: number;
  generationId: string;
  prompt: string;
  duration?: number;
  status: 'success' | 'failed';
}

export interface UsageSummary {
  totalCost: number;
  totalGenerations: number;
  successfulGenerations: number;
  failedGenerations: number;
  byApi: Record<string, { cost: number; count: number; successCount: number }>;
  byUser: Record<string, { cost: number; count: number }>;
  byProject: Record<string, { cost: number; count: number }>;
}

// ---- In-Memory Store + File Persistence ----

const COST_LOG_PATH = process.env.COST_LOG_PATH || path.join(__dirname, '../../data/cost_log.jsonl');
const costEntries: CostEntry[] = [];
let dirty = false;

// Ensure data directory exists
const dataDir = path.dirname(COST_LOG_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load existing entries
if (fs.existsSync(COST_LOG_PATH)) {
  try {
    const content = fs.readFileSync(COST_LOG_PATH, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        costEntries.push(JSON.parse(line));
      } catch { /* skip malformed lines */ }
    }
  } catch (err) {
    console.warn('[CostTracker] Could not load existing cost log:', err);
  }
}

// Periodic flush
setInterval(() => {
  if (dirty) {
    flushToDisk();
  }
}, 30000); // Every 30 seconds

function flushToDisk(): void {
  try {
    const lines = costEntries.map(e => JSON.stringify(e)).join('\n');
    fs.writeFileSync(COST_LOG_PATH, lines + (lines ? '\n' : ''), 'utf-8');
    dirty = false;
  } catch (err) {
    console.error('[CostTracker] Failed to flush cost log:', err);
  }
}

// ---- Tracking ----

/**
 * Track an API generation cost
 */
export function trackCost(entry: Omit<CostEntry, 'timestamp' | 'status' | 'cost'> & {
  cost?: number;
  creditsUsed: number;
}): void {
  const costEntry: CostEntry = {
    timestamp: new Date().toISOString(),
    apiName: entry.apiName,
    userId: entry.userId,
    projectId: entry.projectId,
    sceneId: entry.sceneId,
    creditsUsed: entry.creditsUsed,
    cost: entry.cost ?? entry.creditsUsed,
    generationId: entry.generationId,
    prompt: entry.prompt.substring(0, 200),
    status: 'success',
  };

  costEntries.push(costEntry);
  dirty = true;

  console.log(`[CostTracker] +$${costEntry.cost.toFixed(4)} (${costEntry.apiName}) | User: ${costEntry.userId || 'anon'} | Total entries: ${costEntries.length}`);

  // Check budget alerts
  checkBudgetAlerts(costEntry);
}

/**
 * Track a failed generation (cost may be partial)
 */
export function trackFailedCost(entry: Omit<CostEntry, 'timestamp' | 'status'>): void {
  const costEntry: CostEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    status: 'failed',
  };

  costEntries.push(costEntry);
  dirty = true;

  console.log(`[CostTracker] FAILED: $${costEntry.cost.toFixed(4)} (${costEntry.apiName}) | ${entry.generationId}`);
}

// ---- Budget Alerts ----

interface BudgetLimit {
  maxTotal: number;
  maxPerApi: Record<string, number>;
  maxPerUser: Record<string, number>;
}

const DEFAULT_BUDGET: BudgetLimit = {
  maxTotal: 100.00,
  maxPerApi: {
    sora: 50.00,
    runway: 30.00,
    seedance: 10.00,
    luma: 20.00,
  },
  maxPerUser: {},
};

let activeBudget: BudgetLimit = { ...DEFAULT_BUDGET };

export function setBudget(budget: Partial<BudgetLimit>): void {
  activeBudget = { ...activeBudget, ...budget };
}

function checkBudgetAlerts(entry: CostEntry): void {
  const summary = getUsageSummary();

  // Total budget alert
  if (summary.totalCost > activeBudget.maxTotal * 0.9) {
    const pctUsed = ((summary.totalCost / activeBudget.maxTotal) * 100).toFixed(0);
    console.warn(`⚠️ [Budget Alert] Total cost at ${pctUsed}% of budget: $${summary.totalCost.toFixed(2)} / $${activeBudget.maxTotal.toFixed(2)}`);
  }

  // Per-API budget alert
  const apiBudget = activeBudget.maxPerApi[entry.apiName];
  if (apiBudget && summary.byApi[entry.apiName]) {
    const apiCost = summary.byApi[entry.apiName].cost;
    if (apiCost > apiBudget * 0.9) {
      const pctUsed = ((apiCost / apiBudget) * 100).toFixed(0);
      console.warn(`⚠️ [Budget Alert] ${entry.apiName} at ${pctUsed}% of budget: $${apiCost.toFixed(2)} / $${apiBudget.toFixed(2)}`);
    }
  }
}

// ---- Queries ----

/**
 * Get total usage summary
 */
export function getUsageSummary(filter?: {
  userId?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
}): UsageSummary {
  let entries = costEntries;

  if (filter?.userId) {
    entries = entries.filter(e => e.userId === filter.userId);
  }
  if (filter?.projectId) {
    entries = entries.filter(e => e.projectId === filter.projectId);
  }
  if (filter?.startDate) {
    const start = new Date(filter.startDate).getTime();
    entries = entries.filter(e => new Date(e.timestamp).getTime() >= start);
  }
  if (filter?.endDate) {
    const end = new Date(filter.endDate).getTime();
    entries = entries.filter(e => new Date(e.timestamp).getTime() <= end);
  }

  const summary: UsageSummary = {
    totalCost: 0,
    totalGenerations: entries.length,
    successfulGenerations: 0,
    failedGenerations: 0,
    byApi: {},
    byUser: {},
    byProject: {},
  };

  for (const entry of entries) {
    summary.totalCost += entry.cost;

    if (entry.status === 'success') {
      summary.successfulGenerations++;
    } else {
      summary.failedGenerations++;
    }

    // By API
    if (!summary.byApi[entry.apiName]) {
      summary.byApi[entry.apiName] = { cost: 0, count: 0, successCount: 0 };
    }
    summary.byApi[entry.apiName].cost += entry.cost;
    summary.byApi[entry.apiName].count++;
    if (entry.status === 'success') summary.byApi[entry.apiName].successCount++;

    // By User
    const userKey = entry.userId || 'anonymous';
    if (!summary.byUser[userKey]) {
      summary.byUser[userKey] = { cost: 0, count: 0 };
    }
    summary.byUser[userKey].cost += entry.cost;
    summary.byUser[userKey].count++;

    // By Project
    if (entry.projectId) {
      if (!summary.byProject[entry.projectId]) {
        summary.byProject[entry.projectId] = { cost: 0, count: 0 };
      }
      summary.byProject[entry.projectId].cost += entry.cost;
      summary.byProject[entry.projectId].count++;
    }
  }

  // Round costs
  summary.totalCost = Math.round(summary.totalCost * 10000) / 10000;

  return summary;
}

/**
 * Get recent cost entries
 */
export function getRecentEntries(limit: number = 50): CostEntry[] {
  return costEntries.slice(-limit).reverse();
}

/**
 * Get cost entries for a specific generation
 */
export function getEntryByGenerationId(generationId: string): CostEntry | undefined {
  return costEntries.find(e => e.generationId === generationId);
}

/**
 * Get estimated cost for a batch of scenes
 */
export function estimateBatchCost(
  sceneCount: number,
  avgDurationSeconds: number = 5,
  apiDistribution?: Record<string, number> // e.g., { sora: 0.3, runway: 0.4, seedance: 0.3 }
): number {
  const distribution = apiDistribution || { sora: 0.2, runway: 0.4, seedance: 0.3, luma: 0.1 };
  const costs: Record<string, number> = {
    sora: 0.20,
    runway: 0.05,
    seedance: 0.02,
    luma: 0.03,
  };

  let total = 0;
  for (const [api, fraction] of Object.entries(distribution)) {
    const apiCost = costs[api] || 0.05;
    total += sceneCount * fraction * avgDurationSeconds * apiCost;
  }

  return Math.round(total * 100) / 100;
}

// ---- Export ----

/**
 * Export all cost data as CSV
 */
export function exportCostCsv(): string {
  const header = 'timestamp,apiName,userId,projectId,cost,status,generationId';
  const rows = costEntries.map(e =>
    `${e.timestamp},${e.apiName},${e.userId || ''},${e.projectId || ''},${e.cost},${e.status},${e.generationId}`
  );
  return [header, ...rows].join('\n');
}

// Clean shutdown
process.on('beforeExit', () => {
  if (dirty) flushToDisk();
});
process.on('SIGTERM', () => {
  if (dirty) flushToDisk();
});
process.on('SIGINT', () => {
  if (dirty) flushToDisk();
});
