"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getScript, updateScript, createScript, parseScript,
  getScriptBreakdown, uploadScriptFile,
  Script, ScriptParseResult, ScriptBreakdown,
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
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const user = getStoredUser();

  // Load script data
  useEffect(() => {
    if (!user) { router.push("/auth"); return; }
    loadScript();
  }, [projectId]);

  // Auto-save with debounce
  useEffect(() => {
    if (!script && content.trim()) {
      // New unsaved script - mark as unsaved but don't auto-create
      setAutoSaveStatus("unsaved");
      return;
    }
    if (!script || !content.trim() || content === script.script_content) {
      if (content === script?.script_content) setAutoSaveStatus("saved");
      return;
    }

    setAutoSaveStatus("unsaved");

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      const result = await updateScript(script!.id, {
        script_title: title,
        script_content: content,
        genre: genre || undefined,
      });
      if (result.ok && result.data) {
        setScript(result.data.script);
        setAutoSaveStatus("saved");
      } else {
        setAutoSaveStatus("unsaved");
      }
    }, 2000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [content, title, genre]);

  // Sync line number scroll with textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    const lineNumbers = lineNumbersRef.current;
    if (!textarea || !lineNumbers) return;

    const syncScroll = () => {
      lineNumbers.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener("scroll", syncScroll);
    return () => textarea.removeEventListener("scroll", syncScroll);
  }, []);

  async function loadScript() {
    setLoading(true);
    const result = await getScript(projectId);
    if (result.ok && result.data) {
      const s = result.data.script;
      setScript(s);
      setTitle(s.script_title);
      setContent(s.script_content);
      setGenre(s.genre || "");
      const bdResult = await getScriptBreakdown(projectId);
      if (bdResult.ok && bdResult.data?.parsed) {
        setBreakdown(bdResult.data);
      }
    } else {
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
          setAutoSaveStatus("saved");
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
          setAutoSaveStatus("saved");
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

  // Handle script file upload (.txt, .pdf, .docx)
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  async function processFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["txt", "pdf", "docx"].includes(ext || "")) {
      setError(`Unsupported file type: .${ext}. Use .txt, .pdf, or .docx`);
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    const result = await uploadScriptFile(file);
    if (result.ok && result.data) {
      const d = result.data;
      setContent(d.extractedText);
      setTitle(d.suggestedTitle || title || d.fileName.replace(/\.[^.]+$/, ""));
      if (d.detectedGenre && d.detectedGenre !== "unknown") {
        setGenre(d.detectedGenre);
      }
      setSuccess(`File uploaded! ${d.wordCount.toLocaleString()} words extracted from "${d.fileName}"`);
    } else {
      setError(result.error || "Upload failed");
    }
    setUploading(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
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

  function getLineCount(): number {
    return content.split("\n").length;
  }

  // Generate line numbers
  const lineNumbers = Array.from({ length: Math.max(getLineCount(), 1) }, (_, i) => i + 1);

  // Handle Tab key in textarea
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newValue = content.substring(0, start) + "    " + content.substring(end);
      setContent(newValue);
      // Move cursor after the tab
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 4;
          textareaRef.current.selectionEnd = start + 4;
        }
      });
    }
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
          <div className="flex items-center gap-3">
            {/* Auto-save indicator */}
            {script && (
              <span className={`text-xs flex items-center gap-1 ${
                autoSaveStatus === "saved" ? "text-green-400" :
                autoSaveStatus === "saving" ? "text-amber-400" :
                "text-zinc-500"
              }`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                  autoSaveStatus === "saved" ? "bg-green-400" :
                  autoSaveStatus === "saving" ? "bg-amber-400 animate-pulse" :
                  "bg-zinc-600"
                }`} />
                {autoSaveStatus === "saved" ? "Saved" : autoSaveStatus === "saving" ? "Saving..." : "Unsaved"}
              </span>
            )}
            <span className="text-xs text-zinc-500">
              {getWordCount().toLocaleString()} words · {getLineCount().toLocaleString()} lines
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.pdf,.docx"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? "⏳ Extracting..." : "📂 Upload Script"}
            </Button>
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

            {/* Drag & Drop Zone for script files */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`rounded-lg border-2 border-dashed p-3 text-center transition cursor-pointer ${
                dragOver
                  ? "border-blue-400 bg-blue-500/10"
                  : "border-zinc-700 hover:border-zinc-600 bg-zinc-900/20"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <p className="text-xs text-zinc-400">
                {uploading ? "⏳ Extracting text..." : "📂 Drop a script file here (.txt, .pdf, .docx) or click to browse"}
              </p>
            </div>

            {/* Line-numbered text editor */}
            <div className="flex rounded-lg border border-zinc-700 bg-zinc-800/50 focus-within:border-zinc-500 overflow-hidden">
              {/* Line Numbers */}
              <div
                ref={lineNumbersRef}
                className="select-none overflow-hidden bg-zinc-800/80 py-3 pl-3 pr-2 text-right font-mono text-xs leading-relaxed text-zinc-600 border-r border-zinc-700/50 shrink-0"
                style={{ minWidth: "3.5rem", maxHeight: "500px" }}
              >
                {lineNumbers.map((num) => (
                  <div key={num}>{num}</div>
                ))}
              </div>
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Paste or type your script, or upload a file...

Use standard screenplay format:
INT. COFFEE SHOP - DAY

JOHN
(sipping coffee)
I can't believe this is happening.

SARAH
We need to leave. Now.`}
                className="flex-1 resize-y bg-transparent px-4 py-3 font-mono text-sm leading-relaxed text-white placeholder-zinc-500 outline-none"
                style={{ minHeight: "400px" }}
                spellCheck={false}
                rows={20}
              />
            </div>

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
            {/* Quick Stats */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <h3 className="font-semibold text-white mb-2 text-sm">📊 Script Stats</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Words", value: getWordCount().toLocaleString() },
                  { label: "Lines", value: getLineCount().toLocaleString() },
                  { label: "Est. Duration", value: `${Math.ceil(getWordCount() / 150)} min` },
                  { label: "Characters", value: `${Math.ceil(getWordCount() / 5)}` },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-zinc-800/40 p-2 text-center">
                    <div className="text-lg font-bold text-white">{stat.value}</div>
                    <div className="text-[10px] text-zinc-500">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

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
                <h3 className="font-semibold text-white mb-3 text-sm">🎭 Characters ({breakdown.characters.length})</h3>
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
                <h3 className="font-semibold text-white mb-3 text-sm">📖 Chapters ({breakdown.chapters.length})</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {breakdown.chapters.map((ch) => {
                    const chapterScenes = breakdown.scenes.filter(
                      (s: any) => s.chapter_id === ch.id
                    );
                    return (
                      <div key={ch.id} className="rounded-lg bg-zinc-800/40 px-3 py-2">
                        <p className="text-xs font-medium text-white">
                          Ch {ch.chapter_number}: {ch.chapter_title}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {chapterScenes.length} scene{chapterScenes.length !== 1 ? "s" : ""} — {(ch.content_summary || "").slice(0, 80)}...
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
                <li>• Upload .txt, .pdf, or .docx files</li>
                <li>• Auto-save after 2s of inactivity</li>
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