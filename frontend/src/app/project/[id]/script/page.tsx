"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getScript, updateScript, createScript, parseScript,
  getScriptBreakdown, Script, ScriptParseResult, ScriptBreakdown,
  getStoredUser, clearAuth,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function ScriptEditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const projectId = parseInt(params.id, 10);
  const [script, setScript] = useState<Script | null>(null);
  const [breakdown, setBreakdown] = useState<ScriptBreakdown | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [genre, setGenre] = useState("");
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [parseResult, setParseResult] = useState<ScriptParseResult | null>(null);
  const user = getStoredUser();

  useEffect(() => {
    if (!user) { router.push("/auth"); return; }
    loadScript();
  }, [projectId]);

  async function loadScript() {
    setLoading(true);
    const result = await getScript(projectId);
    if (result.ok && result.data) {
      const s = result.data.script;
      setScript(s);
      setTitle(s.script_title);
      setContent(s.script_content);
      setGenre(s.genre || "");
      // Load breakdown
      const bdResult = await getScriptBreakdown(projectId);
      if (bdResult.ok && bdResult.data?.parsed) {
        setBreakdown(bdResult.data);
      }
    } else {
      // New project - show empty editor
      setScript(null);
      setError("");
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!title.trim()) { setError("Title is required"); return; }
    if (!content.trim()) { setError("Script content is required"); return; }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (script) {
        const result = await updateScript(projectId, {
          script_title: title,
          script_content: content,
          genre: genre || undefined,
        });
        if (result.ok && result.data) {
          setScript(result.data.script);
          setSuccess("Script saved!");
        } else {
          setError(result.error || "Save failed");
        }
      } else {
        const result = await createScript({
          script_title: title,
          script_content: content,
          genre: genre || undefined,
        });
        if (result.ok && result.data) {
          setScript(result.data.script);
          setSuccess("Script created! You can now parse it.");
        } else {
          setError(result.error || "Creation failed");
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleParse() {
    if (!script) {
      setError("Save the script first before parsing");
      return;
    }

    setParsing(true);
    setError("");
    setParseResult(null);

    const result = await parseScript(projectId);
    if (result.ok && result.data) {
      setParseResult(result.data);
      setSuccess(
        result.data.usedAI
          ? "AI script breakdown complete!"
          : "Basic script breakdown complete (AI was unavailable)"
      );
      // Reload breakdown
      const bdResult = await getScriptBreakdown(projectId);
      if (bdResult.ok && bdResult.data) {
        setBreakdown(bdResult.data);
      }
    } else {
      setError(result.error || "Parsing failed");
    }
    setParsing(false);
  }

  function getWordCount(): number {
    return content.split(/\s+/).filter(Boolean).length;
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
            <button onClick={() => router.push(`/project/${projectId}`)} className="text-zinc-400 hover:text-white transition">← Project</button>
            <h1 className="text-lg font-bold text-white">📜 Script Editor</h1>
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
            <span className="text-xs text-zinc-500">{getWordCount().toLocaleString()} words</span>
            <Button variant="outline" size="sm" onClick={() => router.push(`/project/${projectId}`)}>
              Dashboard
            </Button>
          </div>
        </div>
        {/* Tab Nav */}
        <nav className="mx-auto max-w-7xl px-6 flex gap-1 -mb-px">
          {[
            { label: "📜 Script", href: `/project/${projectId}/script`, active: true },
            { label: "🎭 Characters", href: `/project/${projectId}/characters` },
            { label: "📁 Assets", href: `/project/${projectId}/assets` },
          ].map((tab) => (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={`px-4 py-2.5 text-sm transition border-b-2 ${
                tab.active
                  ? "text-white border-white"
                  : "text-zinc-400 hover:text-white border-transparent hover:border-zinc-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Alerts */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            {success}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Editor (2/3 width) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Script Title"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-xl font-semibold text-white placeholder-zinc-500 outline-none focus:border-zinc-500"
            />

            {/* Genre */}
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="Genre (e.g., sci-fi, drama, action)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-500"
            />

            {/* Text Editor */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Paste or type your script here...

Use standard screenplay format:
INT. COFFEE SHOP - DAY

JOHN
(sipping coffee)
I can't believe this is happening.

SARAH
We need to leave. Now.`}
              className="w-full min-h-[400px] rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-500 font-mono resize-y"
              spellCheck={false}
            />

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "Saving..." : script ? "💾 Save Script" : "✨ Create Script"}
              </Button>
              <Button
                onClick={handleParse}
                disabled={parsing || !script}
                variant="outline"
                className="flex-1"
              >
                {parsing ? "🤖 Parsing with AI..." : "🤖 AI Scene Breakdown"}
              </Button>
            </div>
          </div>

          {/* Sidebar: Breakdown Results */}
          <div className="space-y-4">
            {/* Parse Result Summary */}
            {parseResult && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
                <h3 className="font-semibold text-green-400 mb-2">
                  {parseResult.usedAI ? "🤖 AI Breakdown" : "📋 Basic Breakdown"}
                </h3>
                <ul className="space-y-1 text-sm text-zinc-300">
                  <li>📖 {parseResult.chaptersCount} chapters</li>
                  <li>🎬 {parseResult.scenesCount} scenes</li>
                  <li>🎭 {parseResult.characters.length} characters</li>
                </ul>
              </div>
            )}

            {/* Characters from Breakdown */}
            {breakdown?.parsed && breakdown.characters.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h3 className="font-semibold text-white mb-3 text-sm">🎭 Characters</h3>
                <div className="space-y-2">
                  {breakdown.characters.map((char) => (
                    <div key={char.id} className="flex items-center gap-2 rounded-lg bg-zinc-800/40 px-3 py-2">
                      {char.image_url ? (
                        <img src={char.image_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold">
                          {char.character_name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{char.character_name}</p>
                        <p className="text-xs text-zinc-500">{char.character_type || "—"}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => router.push(`/project/${projectId}/characters`)}
                  className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition"
                >
                  Manage Characters →
                </button>
              </div>
            )}

            {/* Chapters/Scenes Summary */}
            {breakdown?.parsed && breakdown.chapters.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h3 className="font-semibold text-white mb-3 text-sm">📖 Chapters</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {breakdown.chapters.map((ch) => {
                    const chapterScenes = breakdown.scenes.filter((s) => s.chapter_id === ch.id);
                    return (
                      <div key={ch.id} className="rounded-lg bg-zinc-800/40 px-3 py-2">
                        <p className="text-xs font-medium text-white">
                          Ch {ch.chapter_number}: {ch.chapter_title}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {chapterScenes.length} scene{chapterScenes.length !== 1 ? "s" : ""} — {ch.content_summary?.slice(0, 80)}...
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Help Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h3 className="font-semibold text-white mb-2 text-sm">💡 Tips</h3>
              <ul className="space-y-1 text-xs text-zinc-400">
                <li>• Use INT./EXT. scene headers for best parsing</li>
                <li>• ALL CAPS character names before dialogue</li>
                <li>• AI parsing requires Anthropic API access</li>
                <li>• Save before running AI breakdown</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
