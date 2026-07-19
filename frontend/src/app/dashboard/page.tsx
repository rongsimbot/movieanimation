"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getDashboard,
  listScripts,
  getStoredUser,
  clearAuth,
  DashboardData,
  AuthResult,
  Script,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { RefreshCw, Film, FileText, DollarSign, HardDrive, ArrowRight, AlertCircle } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const user = getStoredUser();

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError("");

    try {
      const [dashResult, scriptResult] = await Promise.all([
        getDashboard(),
        listScripts({ limit: 5 }),
      ]);

      if (dashResult.ok && dashResult.data) {
        setData(dashResult.data);
      } else {
        if (dashResult.status === 401 || dashResult.status === 403) {
          clearAuth();
          router.push("/auth");
          return;
        }
        setError(dashResult.error || "Failed to load dashboard");
      }

      if (scriptResult.ok && scriptResult.data) {
        setScripts(scriptResult.data.scripts || []);
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    if (!user) {
      router.push("/auth");
      return;
    }
    fetchData();
  }, [fetchData, router, user]);

  const handleLogout = () => {
    clearAuth();
    router.push("/auth");
  };

  // ─── Loading Skeleton ──────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <h1 className="text-lg font-bold text-white">🎬 MovieAnimation</h1>
            <div className="h-8 w-20 animate-pulse rounded bg-zinc-800" />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-8">
            <div className="h-8 w-64 animate-pulse rounded bg-zinc-800 mb-2" />
            <div className="h-4 w-48 animate-pulse rounded bg-zinc-800" />
          </div>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                <div className="h-8 w-8 animate-pulse rounded bg-zinc-800 mb-3" />
                <div className="h-8 w-16 animate-pulse rounded bg-zinc-800 mb-1" />
                <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ─── Error State ───────────────────────────────────────────
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 mb-2">{error}</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => fetchData(true)}>Retry</Button>
            <Button variant="outline" onClick={() => router.push("/auth")}>Login</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-bold text-white">🎬 MovieAnimation</h1>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="text-zinc-400 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <span className="text-sm text-zinc-400 hidden sm:inline">
              {data?.user.name || user?.name}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Dashboard Content */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white">
            Welcome back, {data?.user.name || user?.name}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Here&apos;s your animation studio overview
          </p>
        </div>

        {/* Stats Grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Scripts Uploaded"
            value={data?.stats.scriptsUploaded ?? scripts.length}
            icon={<FileText className="w-6 h-6 text-blue-400" />}
          />
          <StatCard
            label="Animations Generated"
            value={data?.stats.animationsGenerated ?? 0}
            icon={<Film className="w-6 h-6 text-purple-400" />}
          />
          <StatCard
            label="Credits Remaining"
            value={data?.stats.creditsRemaining ?? 120}
            icon={<DollarSign className="w-6 h-6 text-green-400" />}
          />
          <StatCard
            label="Storage Used"
            value={data?.stats.storageUsed ?? "0 GB"}
            icon={<HardDrive className="w-6 h-6 text-amber-400" />}
            isString
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Projects */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                📂 Your Scripts
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard")}
                className="text-zinc-400 hover:text-white text-xs"
              >
                View All <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
            {scripts.length > 0 ? (
              <ul className="space-y-2">
                {scripts.map((script) => (
                  <li key={script.id}>
                    <button
                      onClick={() => router.push(`/project/${script.id}/script`)}
                      className="w-full text-left rounded-lg border border-zinc-800 bg-zinc-800/40 px-4 py-3 hover:border-zinc-600 hover:bg-zinc-800 transition group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">
                            {script.script_title || `Script #${script.id}`}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {script.genre || "No genre"} · {script.word_count ? `${script.word_count} words` : "Unknown length"}
                          </p>
                        </div>
                        <span className={`ml-3 flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${
                          script.status === "approved"
                            ? "bg-green-500/10 text-green-400"
                            : script.status === "review"
                            ? "bg-amber-500/10 text-amber-400"
                            : script.status === "archived"
                            ? "bg-zinc-500/10 text-zinc-400"
                            : "bg-blue-500/10 text-blue-400"
                        }`}>
                          {script.status}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-500 mb-3">No scripts yet</p>
                <Button
                  size="sm"
                  onClick={() => router.push("/dashboard")}
                  className="text-xs"
                >
                  Create Your First Script
                </Button>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              📋 Recent Activity
            </h3>
            {data?.recentActivity && data.recentActivity.length > 0 ? (
              <ul className="space-y-3">
                {data.recentActivity.map((activity, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-zinc-800/40 px-4 py-3"
                  >
                    <span className="text-sm text-zinc-300">
                      {activity.description}
                    </span>
                    <span className="text-xs text-zinc-500 ml-2 flex-shrink-0">
                      {formatRelativeTime(activity.date)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-8">
                Activity will appear here as you use the platform
              </p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="mb-4 text-lg font-semibold text-white">
            ⚡ Quick Actions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => router.push("/project/new")}
              className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-left text-sm text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 transition"
            >
              🎬 Create New Project
            </button>
            <button
              onClick={() => router.push("/dashboard/costs")}
              className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-left text-sm text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 transition"
            >
              📊 View Cost Dashboard
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-left text-sm text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 transition"
            >
              📤 Upload Script
            </button>
          </div>
        </div>

        {/* Active Jobs Banner */}
        {data?.stats.activeJobs && data.stats.activeJobs > 0 && (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
            <h3 className="mb-2 text-lg font-semibold text-amber-400">
              ⚡ Active Jobs
            </h3>
            <p className="text-sm text-zinc-400">
              {data.stats.activeJobs} job{data.stats.activeJobs > 1 ? "s" : ""}{" "}
              currently processing. Check the queue for status.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ─── Stat Card Component ─────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  isString,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  isString?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 hover:border-zinc-700 transition">
      <div className="mb-3">{icon}</div>
      <div className="text-2xl font-bold text-white">
        {isString ? value : Number(value).toLocaleString()}
      </div>
      <div className="mt-1 text-sm text-zinc-400">{label}</div>
    </div>
  );
}
