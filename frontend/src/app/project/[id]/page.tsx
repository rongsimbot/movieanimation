"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getScriptBreakdown, getScript, Script, ScriptBreakdown } from "@/lib/api";
import { getStoredUser, clearAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function ProjectPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const projectId = parseInt(params.id, 10);
  const [script, setScript] = useState<Script | null>(null);
  const [breakdown, setBreakdown] = useState<ScriptBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const user = getStoredUser();

  useEffect(() => {
    if (!user) { router.push("/auth"); return; }
    loadProject();
  }, [projectId]);

  async function loadProject() {
    setLoading(true);
    // Try loading as script ID
    const scriptResult = await getScript(projectId);
    if (scriptResult.ok && scriptResult.data) {
      setScript(scriptResult.data.script);
      // Load breakdown
      const bdResult = await getScriptBreakdown(projectId);
      if (bdResult.ok && bdResult.data) {
        setBreakdown(bdResult.data);
      }
    } else {
      setError("Project not found. Create a script first.");
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/dashboard")} className="text-zinc-400 hover:text-white transition">← Back</button>
            <h1 className="text-lg font-bold text-white">
              {script?.script_title || `Project #${projectId}`}
            </h1>
            {script?.status && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                script.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                script.status === 'review' ? 'bg-amber-500/20 text-amber-400' :
                'bg-zinc-700 text-zinc-400'
              }`}>
                {script.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={() => { clearAuth(); router.push("/auth"); }}>
              Sign Out
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="mx-auto max-w-7xl px-6 flex gap-1 -mb-px">
          {[
            { label: "📜 Script", href: `/project/${projectId}/script` },
            { label: "🎭 Characters", href: `/project/${projectId}/characters` },
            { label: "📁 Assets", href: `/project/${projectId}/assets` },
            { label: "⏱️ Timeline", href: `/project/${projectId}/timeline` },
          ].map((tab) => (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className="px-4 py-2.5 text-sm text-zinc-400 hover:text-white border-b-2 border-transparent hover:border-zinc-700 transition"
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {error ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">📜</p>
            <h2 className="text-xl font-semibold text-white mb-2">No Script Found</h2>
            <p className="text-zinc-400 mb-6">{error}</p>
            <Button onClick={() => router.push(`/project/${projectId}/script`)}>
              Create Script
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Script Info */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h3 className="text-lg font-semibold mb-3">📄 Script Info</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Words</dt>
                  <dd className="text-white">{script?.word_count?.toLocaleString() || 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Genre</dt>
                  <dd className="text-white">{script?.genre || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Author</dt>
                  <dd className="text-white">{script?.author || "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">Created</dt>
                  <dd className="text-white">{script?.created_at ? new Date(script.created_at).toLocaleDateString() : "—"}</dd>
                </div>
              </dl>
            </div>

            {/* Breakdown Stats */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h3 className="text-lg font-semibold mb-3">🎬 Breakdown</h3>
              {breakdown?.parsed ? (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Chapters</dt>
                    <dd className="text-white">{breakdown.chapters.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Scenes</dt>
                    <dd className="text-white">{breakdown.scenes.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-400">Characters</dt>
                    <dd className="text-white">{breakdown.characters.length}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-zinc-500">
                  Script not parsed yet. Go to the Script tab to run AI scene breakdown.
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h3 className="text-lg font-semibold mb-3">⚡ Quick Actions</h3>
              <div className="space-y-2">
                <button onClick={() => router.push(`/project/${projectId}/script`)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-left text-sm hover:bg-zinc-800 transition">
                  📝 Edit Script
                </button>
                <button onClick={() => router.push(`/project/${projectId}/characters`)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-left text-sm hover:bg-zinc-800 transition">
                  🎭 Manage Characters
                </button>
                <button onClick={() => router.push(`/project/${projectId}/assets`)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5 text-left text-sm hover:bg-zinc-800 transition">
                  📁 Upload Assets
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Character List */}
        {breakdown?.parsed && breakdown.characters.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-white mb-4">🎭 Characters ({breakdown.characters.length})</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {breakdown.characters.map((char) => (
                <div key={char.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    {char.image_url ? (
                      <img src={char.image_url} alt={char.character_name} className="h-12 w-12 rounded-full object-cover border border-zinc-700" />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center text-xl">
                        {char.character_name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-white text-sm">{char.character_name}</p>
                      <p className="text-xs text-zinc-400">{char.character_type || "Unknown role"}</p>
                    </div>
                  </div>
                  {char.description && (
                    <p className="text-xs text-zinc-500 line-clamp-2">{char.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
