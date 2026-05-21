'use client';

import { useEffect, useState, useCallback } from 'react';
import { getCostMetrics, getUsageStats, getDAUTrend, CostMetrics, UsageStats, DAUTrend } from '@/lib/api';
import { DollarSign, TrendingUp, CreditCard, Activity, BarChart3, Users, Film, Globe, RefreshCw, Calendar, AlertCircle } from 'lucide-react';

export default function CostDashboardPage() {
  const [costs, setCosts] = useState<CostMetrics | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [dau, setDau] = useState<DAUTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [dauDays, setDauDays] = useState(7);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError('');

    try {
      const [costRes, usageRes, dauRes] = await Promise.all([
        getCostMetrics(),
        getUsageStats(),
        getDAUTrend(dauDays),
      ]);
      if (costRes.ok && costRes.data) setCosts(costRes.data);
      else if (!costRes.ok) throw new Error(costRes.error);
      if (usageRes.ok && usageRes.data) setUsage(usageRes.data);
      else if (!usageRes.ok) throw new Error(usageRes.error);
      if (dauRes.ok && dauRes.data) setDau(dauRes.data);
      else if (!dauRes.ok) throw new Error(dauRes.error);
    } catch (e: any) {
      setError(e.message || 'Failed to load analytics data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dauDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Loading State ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="mb-10">
            <div className="h-8 w-72 animate-pulse rounded bg-zinc-800 mb-2" />
            <div className="h-4 w-96 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 animate-pulse">
                <div className="h-5 w-24 bg-zinc-800 rounded mb-3" />
                <div className="h-8 w-20 bg-zinc-800 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-10 animate-pulse">
            <div className="h-5 w-40 bg-zinc-800 rounded mb-4" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-6 w-full bg-zinc-800 rounded mb-3" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Error State ──────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 text-lg mb-4">{error}</p>
          <button
            onClick={() => fetchData(true)}
            className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition"
          >
            <RefreshCw className="w-4 h-4 inline mr-2" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const formatCurrency = (n: number) => `$${n.toFixed(2)}`;
  const formatNumber = (n: number) => n.toLocaleString();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">📊 Cost Monitoring Dashboard</h1>
            <p className="text-zinc-400">Track API spending, platform usage, and cost projections</p>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="inline-flex items-center px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition disabled:opacity-50 self-start"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Cost Overview Cards */}
        {costs && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <DollarSign className="w-5 h-5 text-purple-400" />
                </div>
                <span className="text-zinc-400 text-sm">Total Spent</span>
              </div>
              <p className="text-2xl font-bold text-purple-400">{formatCurrency(costs.totalSpent)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Activity className="w-5 h-5 text-green-400" />
                </div>
                <span className="text-zinc-400 text-sm">Today</span>
              </div>
              <p className="text-2xl font-bold text-green-400">{formatCurrency(costs.spentToday)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <CreditCard className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-zinc-400 text-sm">This Month</span>
              </div>
              <p className="text-2xl font-bold text-blue-400">{formatCurrency(costs.spentThisMonth)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-amber-500/10 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                </div>
                <span className="text-zinc-400 text-sm">Projected Monthly</span>
              </div>
              <p className="text-2xl font-bold text-amber-400">{formatCurrency(costs.projectedMonthly)}</p>
            </div>
          </div>
        )}

        {/* By Provider */}
        {costs && Object.keys(costs.byProvider).length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-10">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-400" /> Cost by API Provider
            </h2>
            <div className="space-y-3">
              {Object.entries(costs.byProvider).map(([provider, cost]) => {
                const max = Math.max(...Object.values(costs.byProvider), 0.01);
                const pct = ((cost / max) * 100).toFixed(0);
                return (
                  <div key={provider}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-zinc-300 capitalize">{provider}</span>
                      <span className="text-zinc-400">{formatCurrency(cost)}</span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Usage Stats */}
        {usage && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center hover:border-zinc-700 transition">
              <Users className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{formatNumber(usage.totalUsers)}</p>
              <p className="text-xs text-zinc-500">Total Users</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center hover:border-zinc-700 transition">
              <Activity className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{formatNumber(usage.activeUsersToday)}</p>
              <p className="text-xs text-zinc-500">Active Today</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center hover:border-zinc-700 transition">
              <Film className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{formatNumber(usage.totalVideoGenerations)}</p>
              <p className="text-xs text-zinc-500">Total Generations</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center hover:border-zinc-700 transition">
              <BarChart3 className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{formatNumber(usage.totalApiCalls)}</p>
              <p className="text-xs text-zinc-500">Total API Calls</p>
            </div>
          </div>
        )}

        {/* DAU Trend with Date Range Selector */}
        {dau.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-green-400" /> Daily Active Users
              </h2>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-zinc-500" />
                <select
                  value={dauDays}
                  onChange={(e) => setDauDays(Number(e.target.value))}
                  className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-300 focus:outline-none focus:border-zinc-500"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              </div>
            </div>
            <div className="flex items-end gap-4 h-32">
              {dau.map((d) => {
                const maxDAU = Math.max(...dau.map(d => d.count), 1);
                const height = ((d.count / maxDAU) * 100).toFixed(0);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-white font-semibold">{d.count}</span>
                    <div
                      className="w-full bg-green-500/80 rounded-t transition-all hover:bg-green-400"
                      style={{ height: `${height}%`, minHeight: '4px' }}
                      title={`${d.date}: ${d.count} users`}
                    />
                    <span className="text-[10px] text-zinc-500">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Projects by Cost */}
        {costs && costs.byProject && costs.byProject.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              🎬 Top Projects by Cost
            </h2>
            <div className="space-y-2">
              {costs.byProject.map((proj, i) => (
                <div key={proj.projectId} className="flex items-center justify-between rounded-lg bg-zinc-800/40 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 font-mono">#{i + 1}</span>
                    <span className="text-sm text-zinc-300">{proj.projectTitle}</span>
                  </div>
                  <span className="text-sm font-medium text-amber-400">{formatCurrency(proj.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
