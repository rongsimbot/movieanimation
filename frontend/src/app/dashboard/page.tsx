"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDashboard,
  getStoredUser,
  clearAuth,
  DashboardData,
  AuthResult,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const user = getStoredUser();

  useEffect(() => {
    // Redirect to auth if not logged in
    if (!user) {
      router.push("/auth");
      return;
    }

    async function fetchDashboard() {
      const result = await getDashboard();
      if (result.ok && result.data) {
        setData(result.data);
      } else {
        // Token might be expired — redirect to login
        if (result.status === 401 || result.status === 403) {
          clearAuth();
          router.push("/auth");
        } else {
          setError(result.error || "Failed to load dashboard");
        }
      }
      setLoading(false);
    }

    fetchDashboard();
  }, [router, user]);

  const handleLogout = () => {
    clearAuth();
    router.push("/auth");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
          <p className="text-sm text-zinc-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Button onClick={() => router.push("/auth")}>Go to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-bold text-white">🎬 MovieAnimation</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400">
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
            value={data?.stats.scriptsUploaded ?? 0}
            icon="📄"
          />
          <StatCard
            label="Animations Generated"
            value={data?.stats.animationsGenerated ?? 0}
            icon="🎥"
          />
          <StatCard
            label="Credits Remaining"
            value={data?.stats.creditsRemaining ?? 120}
            icon="💰"
          />
          <StatCard
            label="Storage Used"
            value={data?.stats.storageUsed ?? "0 GB"}
            icon="💾"
            isString
          />
        </div>

        {/* Activity & Quick Actions */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent Activity */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Recent Activity
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
                    <span className="text-xs text-zinc-500">
                      {new Date(activity.date).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">No activity yet</p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
              Quick Actions
            </h3>
            <div className="space-y-3">
              <button
                onClick={() => router.push("/project/new")}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-left text-sm text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 transition"
              >
                🎬 Create New Project
              </button>
              <button
                onClick={() => router.push("/project/list")}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-left text-sm text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 transition"
              >
                📂 View Projects
              </button>
              <button
                onClick={() => router.push("/upload")}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-left text-sm text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 transition"
              >
                📤 Upload Script
              </button>
            </div>
          </div>
        </div>

        {/* Active Jobs */}
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

// ─── Stat Card Component ──────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  isString,
}: {
  label: string;
  value: number | string;
  icon: string;
  isString?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="mb-3 text-2xl">{icon}</div>
      <div className="text-2xl font-bold text-white">
        {isString ? value : Number(value).toLocaleString()}
      </div>
      <div className="mt-1 text-sm text-zinc-400">{label}</div>
    </div>
  );
}
