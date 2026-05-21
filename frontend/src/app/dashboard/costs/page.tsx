'use client';

import { useEffect, useState } from 'react';
import { getCostMetrics, getUsageStats, getDAUTrend, CostMetrics, UsageStats, DAUTrend } from '@/lib/api';
import { DollarSign, TrendingUp, CreditCard, Activity, BarChart3, Users, Film, Globe } from 'lucide-react';

export default function CostDashboardPage() {
  const [costs, setCosts] = useState<CostMetrics | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [dau, setDau] = useState<DAUTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [costRes, usageRes, dauRes] = await Promise.all([
          getCostMetrics(),
          getUsageStats(),
          getDAUTrend(7),
        ]);
        if (costRes.ok && costRes.data) setCosts(costRes.data);
        if (usageRes.ok && usageRes.data) setUsage(usageRes.data);
        if (dauRes.ok && dauRes.data) setDau(dauRes.data);
      } catch (e) {
        setError('Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-zinc-400 text-lg animate-pulse">Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-red-400 text-lg">{error}</p>
      </div>
    );
  }

  const formatCurrency = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">📊 Cost Monitoring Dashboard</h1>
          <p className="text-zinc-400">Track API spending, platform usage, and cost projections</p>
        </div>

        {/* Cost Overview Cards */}
        {costs && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <DollarSign className="w-5 h-5 text-purple-400" />
                </div>
                <span className="text-zinc-400 text-sm">Total Spent</span>
              </div>
              <p className="text-2xl font-bold text-purple-400">{formatCurrency(costs.totalSpent)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <Activity className="w-5 h-5 text-green-400" />
                </div>
                <span className="text-zinc-400 text-sm">Today</span>
              </div>
              <p className="text-2xl font-bold text-green-400">{formatCurrency(costs.spentToday)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <CreditCard className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-zinc-400 text-sm">This Month</span>
              </div>
              <p className="text-2xl font-bold text-blue-400">{formatCurrency(costs.spentThisMonth)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <Users className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{usage.totalUsers}</p>
              <p className="text-xs text-zinc-500">Total Users</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <Activity className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{usage.activeUsersToday}</p>
              <p className="text-xs text-zinc-500">Active Today</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <Film className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{usage.totalVideoGenerations}</p>
              <p className="text-xs text-zinc-500">Total Generations</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <BarChart3 className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{usage.totalApiCalls}</p>
              <p className="text-xs text-zinc-500">Total API Calls</p>
            </div>
          </div>
        )}

        {/* DAU Trend */}
        {dau.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-green-400" /> Daily Active Users (Last 7 Days)
            </h2>
            <div className="flex items-end gap-4 h-32">
              {dau.map((d) => {
                const maxDAU = Math.max(...dau.map(d => d.count), 1);
                const height = ((d.count / maxDAU) * 100).toFixed(0);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-white font-semibold">{d.count}</span>
                    <div
                      className="w-full bg-green-500/80 rounded-t transition-all"
                      style={{ height: `${height}%`, minHeight: '4px' }}
                    />
                    <span className="text-[10px] text-zinc-500">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
