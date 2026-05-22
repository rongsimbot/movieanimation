"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getStoredUser, clearAuth,
  createExport, listExports, deleteExport,
  getExportDownloadUrl, createShareLink, revokeShareLink,
  getExportOptions, getExportQueueStatus,
  getExport, getTimelines, getAssemblyStatus,
  ExportRecord, ExportDetail, ExportStats,
  ResolutionOption, FormatOption,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

// ─── Icons ──────────────────────────────────────────────────────

const Icons = {
  spinner: () => (
    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ),
  download: () => (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  share: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  ),
  trash: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  check: () => (
    <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: () => (
    <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  clock: () => (
    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  copy: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
};

// ─── Page Component ─────────────────────────────────────────────

export default function ExportPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const projectId = parseInt(params.id, 10);
  const user = getStoredUser();

  // State
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [exportStats, setExportStats] = useState<ExportStats | null>(null);
  const [selectedExport, setSelectedExport] = useState<ExportDetail | null>(null);
  const [resolutions, setResolutions] = useState<ResolutionOption[]>([]);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New export form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState("1080p");
  const [selectedFormat, setSelectedFormat] = useState("mp4");
  const [selectedCompression, setSelectedCompression] = useState<"fast" | "medium" | "slow">("medium");
  const [exportBitrate, setExportBitrate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // Share state
  const [sharePassword, setSharePassword] = useState("");
  const [shareMaxDownloads, setShareMaxDownloads] = useState("");
  const [shareExpiration, setShareExpiration] = useState("72"); // hours
  const [creatingShare, setCreatingShare] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Polling for in-progress exports
  const [pollingIds, setPollingIds] = useState<Set<number>>(new Set());

  // Load data
  useEffect(() => {
    if (!user) { router.push("/auth"); return; }
    loadData();
  }, [projectId]);

  // Poll in-progress exports
  useEffect(() => {
    if (pollingIds.size === 0) return;
    const interval = setInterval(() => {
      loadExports();
    }, 5000);
    return () => clearInterval(interval);
  }, [pollingIds]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      // Load export options
      const optsResult = await getExportOptions();
      if (optsResult.ok && optsResult.data) {
        setResolutions(optsResult.data.resolutions);
        setFormats(optsResult.data.formats);
      }

      // Load exports
      await loadExports();
    } catch (e: any) {
      setError(e.message);
    }

    setLoading(false);
  }

  async function loadExports() {
    const result = await listExports();
    if (result.ok && result.data) {
      setExports(result.data.exports);
      setExportStats(result.data.stats);

      // Track polling IDs
      const ids = new Set<number>();
      result.data.exports.forEach((e) => {
        if (e.status === "queued" || e.status === "processing") {
          ids.add(e.id);
        }
      });
      setPollingIds(ids);
    }
  }

  async function handleCreateExport() {
    setExporting(true);
    setExportError("");

    try {
      // Need an assembled timeline to export
      const tlResult = await getTimelines(projectId);
      if (!tlResult.ok || !tlResult.data) {
        setExportError("Could not find timelines. Create and assemble a timeline first.");
        setExporting(false);
        return;
      }

      const completedTl = tlResult.data.timelines.find(
        (t: any) => t.status === "completed" && t.output_path
      );
      if (!completedTl) {
        setExportError(
          "No completed timeline found. Go to the Timeline tab, assemble your timeline, then come back to export."
        );
        setExporting(false);
        return;
      }

      // Check assembly status
      const asResult = await getAssemblyStatus(completedTl.id);
      if (!asResult.ok) {
        setExportError("Could not verify timeline assembly status.");
        setExporting(false);
        return;
      }

      // Get export name based on timeline
      const tlDetail = await (async () => {
        const r = await getTimelines(projectId);
        return r.data?.timelines.find((t: any) => t.id === completedTl.id);
      })();

      const result = await createExport({
        timeline_id: completedTl.id,
        project_id: projectId,
        name: tlDetail?.name ? `${tlDetail.name} Export` : undefined,
        input_path: completedTl.output_path!,
        resolution: selectedResolution as any,
        format: selectedFormat as any,
        bitrate: exportBitrate || undefined,
        compression_level: selectedCompression,
      });

      if (result.ok && result.data) {
        setShowNewForm(false);
        await loadExports();
      } else {
        setExportError(result.error || "Export creation failed");
      }
    } catch (e: any) {
      setExportError(e.message);
    }

    setExporting(false);
  }

  async function handleViewExport(id: number) {
    const result = await getExport(id);
    if (result.ok && result.data) {
      setSelectedExport(result.data.export);
    }
  }

  async function handleDeleteExport(id: number) {
    if (!confirm("Delete this export? The file will be permanently removed.")) return;
    const result = await deleteExport(id);
    if (result.ok) {
      if (selectedExport?.id === id) setSelectedExport(null);
      await loadExports();
    }
  }

  async function handleCreateShare(exportId: number) {
    setCreatingShare(true);
    const result = await createShareLink(exportId, {
      password: sharePassword || undefined,
      max_downloads: shareMaxDownloads ? parseInt(shareMaxDownloads) : undefined,
      expiration_hours: parseInt(shareExpiration) || 72,
    });
    if (result.ok && result.data) {
      setShareUrl(result.data.shareUrl);
      // Refresh export detail
      await handleViewExport(exportId);
    }
    setCreatingShare(false);
  }

  async function handleRevokeShare(exportId: number, token: string) {
    await revokeShareLink(exportId, token);
    if (selectedExport) {
      await handleViewExport(selectedExport.id);
    }
  }

  function copyShareUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ─── Render ───────────────────────────────────────────────────

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
            <button onClick={() => router.push("/dashboard")} className="text-zinc-400 hover:text-white transition">
              ← Back
            </button>
            <h1 className="text-lg font-bold text-white">Export & Download</h1>
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
            { label: "📦 Export", href: `/project/${projectId}/export`, active: true },
          ].map((tab) => (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={`px-4 py-2.5 text-sm transition border-b-2 ${
                tab.active
                  ? "text-white border-indigo-500"
                  : "text-zinc-400 hover:text-white border-transparent hover:border-zinc-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Export List + Create */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Cards */}
            {exportStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <p className="text-2xl font-bold text-white">{exportStats.total}</p>
                  <p className="text-xs text-zinc-400">Total Exports</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <p className="text-2xl font-bold text-green-400">{exportStats.completed}</p>
                  <p className="text-xs text-zinc-400">Completed</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <p className="text-2xl font-bold text-amber-400">{exportStats.processing}</p>
                  <p className="text-xs text-zinc-400">Processing</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <p className="text-2xl font-bold text-zinc-300">
                    {exportStats.totalStorageBytes > 0
                      ? (exportStats.totalStorageBytes / (1024 * 1024)).toFixed(0) + " MB"
                      : "0 MB"}
                  </p>
                  <p className="text-xs text-zinc-400">Storage Used</p>
                </div>
              </div>
            )}

            {/* New Export Button */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Your Exports</h2>
              <Button onClick={() => setShowNewForm(!showNewForm)} size="sm">
                {showNewForm ? "Cancel" : "+ New Export"}
              </Button>
            </div>

            {/* New Export Form */}
            {showNewForm && (
              <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-6 space-y-4">
                <h3 className="font-semibold text-white">New Export Configuration</h3>

                {exportError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-400 text-sm">
                    {exportError}
                  </div>
                )}

                {/* Resolution */}
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Resolution</label>
                  <div className="flex gap-2 flex-wrap">
                    {resolutions.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => { setSelectedResolution(r.id); setExportBitrate(""); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition border ${
                          selectedResolution === r.id
                            ? "border-indigo-500 bg-indigo-500/20 text-white"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        {r.label}
                        <span className="block text-xs text-zinc-500">{r.width}×{r.height}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Format */}
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Format</label>
                  <div className="flex gap-2 flex-wrap">
                    {formats.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFormat(f.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition border uppercase ${
                          selectedFormat === f.id
                            ? "border-indigo-500 bg-indigo-500/20 text-white"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        .{f.extension}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compression Level */}
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Quality / Speed</label>
                  <div className="flex gap-2">
                    {(["fast", "medium", "slow"] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => setSelectedCompression(level)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition border capitalize ${
                          selectedCompression === level
                            ? "border-indigo-500 bg-indigo-500/20 text-white"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        {level}
                        <span className="block text-xs text-zinc-500 mt-0.5">
                          {level === "fast" ? "Smaller file" : level === "slow" ? "Best quality" : "Balanced"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional: Custom bitrate */}
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">
                    Custom Bitrate <span className="text-zinc-600">(optional, e.g. 8M)</span>
                  </label>
                  <input
                    type="text"
                    value={exportBitrate}
                    onChange={(e) => setExportBitrate(e.target.value)}
                    placeholder="Auto (based on quality)"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <Button onClick={handleCreateExport} disabled={exporting} className="w-full">
                  {exporting ? (
                    <span className="flex items-center gap-2"><Icons.spinner /> Queuing Export...</span>
                  ) : (
                    "🚀 Start Export"
                  )}
                </Button>
              </div>
            )}

            {/* Export List */}
            <div className="space-y-3">
              {exports.length === 0 && !showNewForm && (
                <div className="text-center py-12 border border-dashed border-zinc-800 rounded-2xl">
                  <p className="text-4xl mb-3">📦</p>
                  <p className="text-zinc-400 mb-1">No exports yet</p>
                  <p className="text-sm text-zinc-500 mb-4">
                    Assemble your timeline, then export in your preferred resolution and format
                  </p>
                  <Button onClick={() => setShowNewForm(true)} size="sm">
                    Create First Export
                  </Button>
                </div>
              )}

              {exports.map((exp) => (
                <div
                  key={exp.id}
                  onClick={() => handleViewExport(exp.id)}
                  className={`rounded-xl border p-4 cursor-pointer transition ${
                    selectedExport?.id === exp.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Status icon */}
                      {exp.status === "completed" ? <Icons.check /> :
                       exp.status === "failed" ? <Icons.error /> :
                       exp.status === "processing" || exp.status === "queued" ? <Icons.clock /> :
                       <Icons.download />}

                      <div className="min-w-0">
                        <p className="font-medium text-white text-sm truncate">{exp.name}</p>
                        <p className="text-xs text-zinc-500">
                          {exp.resolution} · .{exp.format}
                          {exp.fileSizeFormatted && ` · ${exp.fileSizeFormatted}`}
                          {exp.durationFormatted && ` · ${exp.durationFormatted}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Progress bar */}
                      {(exp.status === "processing" || exp.status === "queued") && (
                        <div className="w-24">
                          <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 transition-all duration-500 rounded-full"
                              style={{ width: `${exp.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">{exp.progress}%</p>
                        </div>
                      )}

                      {/* Action buttons */}
                      {exp.status === "completed" && (
                        <a
                          href={getExportDownloadUrl(exp.id)}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition"
                        >
                          <Icons.download /> Download
                        </a>
                      )}

                      {exp.status === "failed" && (
                        <span className="text-xs text-red-400">Failed</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Export Detail Panel */}
          <div className="space-y-6">
            {selectedExport ? (
              <>
                {/* Detail Card */}
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white">Export Details</h3>
                    <button
                      onClick={() => handleDeleteExport(selectedExport.id)}
                      className="text-zinc-500 hover:text-red-400 transition"
                      title="Delete export"
                    >
                      <Icons.trash />
                    </button>
                  </div>

                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-zinc-400">Status</dt>
                      <dd>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          selectedExport.status === "completed" ? "bg-green-500/20 text-green-400" :
                          selectedExport.status === "processing" ? "bg-amber-500/20 text-amber-400" :
                          selectedExport.status === "queued" ? "bg-blue-500/20 text-blue-400" :
                          selectedExport.status === "failed" ? "bg-red-500/20 text-red-400" :
                          "bg-zinc-700 text-zinc-400"
                        }`}>
                          {selectedExport.status}
                        </span>
                      </dd>
                    </div>

                    {selectedExport.progress > 0 && selectedExport.progress < 100 && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Progress</dt>
                        <dd className="text-white">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${selectedExport.progress}%` }} />
                            </div>
                            {selectedExport.progress}%
                          </div>
                        </dd>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <dt className="text-zinc-400">Resolution</dt>
                      <dd className="text-white">{selectedExport.resolution}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-400">Format</dt>
                      <dd className="text-white uppercase">.{selectedExport.format}</dd>
                    </div>
                    {selectedExport.bitrate && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Bitrate</dt>
                        <dd className="text-white">{selectedExport.bitrate}</dd>
                      </div>
                    )}
                    {selectedExport.framerate && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Framerate</dt>
                        <dd className="text-white">{selectedExport.framerate} fps</dd>
                      </div>
                    )}
                    {selectedExport.compression_level && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Quality</dt>
                        <dd className="text-white capitalize">{selectedExport.compression_level}</dd>
                      </div>
                    )}
                    {selectedExport.durationFormatted && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Duration</dt>
                        <dd className="text-white">{selectedExport.durationFormatted}</dd>
                      </div>
                    )}
                    {selectedExport.fileSizeFormatted && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">File Size</dt>
                        <dd className="text-white">{selectedExport.fileSizeFormatted}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-zinc-400">Created</dt>
                      <dd className="text-white">
                        {new Date(selectedExport.createdAt).toLocaleString()}
                      </dd>
                    </div>
                    {selectedExport.expiresAt && (
                      <div className="flex justify-between">
                        <dt className="text-zinc-400">Expires</dt>
                        <dd className="text-white">
                          {new Date(selectedExport.expiresAt).toLocaleString()}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {/* Download Button */}
                  {selectedExport.status === "completed" && (
                    <a
                      href={getExportDownloadUrl(selectedExport.id)}
                      download
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition"
                    >
                      <Icons.download /> Download {selectedExport.outputFilename || "Video"}
                    </a>
                  )}

                  {/* Error message */}
                  {selectedExport.status === "failed" && selectedExport.errorMessage && (
                    <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                      {selectedExport.errorMessage}
                    </div>
                  )}
                </div>

                {/* Share Section */}
                {selectedExport.status === "completed" && (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                    <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <Icons.share /> Share
                    </h3>

                    {/* Existing share links */}
                    {selectedExport.shareLinks.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {selectedExport.shareLinks.map((link) => (
                          <div key={link.id} className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`rounded-full px-2 py-0.5 text-xs ${link.isActive ? "bg-green-500/20 text-green-400" : "bg-zinc-700 text-zinc-500"}`}>
                                {link.isActive ? "Active" : "Revoked"}
                              </span>
                              <span className="text-xs text-zinc-500">
                                {link.downloadCount} / {link.maxDownloads || "∞"} downloads
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <code className="flex-1 truncate text-xs text-zinc-400 bg-zinc-900 rounded px-2 py-1">
                                {link.shareUrl || `...${link.urlToken.substring(0, 20)}...`}
                              </code>
                              {link.shareUrl && (
                                <button onClick={() => copyShareUrl(link.shareUrl!)} className="text-zinc-500 hover:text-white transition">
                                  <Icons.copy />
                                </button>
                              )}
                            </div>
                            {link.isActive && (
                              <button
                                onClick={() => handleRevokeShare(selectedExport.id, link.urlToken)}
                                className="mt-2 text-xs text-red-400 hover:text-red-300 transition"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Share URL display */}
                    {shareUrl && (
                      <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
                        <p className="text-xs text-green-400 mb-1">Share link created!</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 truncate text-xs text-green-300">{shareUrl}</code>
                          <button onClick={() => copyShareUrl(shareUrl)} className="text-green-400 hover:text-green-300 transition">
                            {copied ? "✓" : <Icons.copy />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Create Share Form */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">
                          Password Protection <span className="text-zinc-600">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={sharePassword}
                          onChange={(e) => setSharePassword(e.target.value)}
                          placeholder="No password"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-400 mb-1">Max Downloads</label>
                          <input
                            type="number"
                            value={shareMaxDownloads}
                            onChange={(e) => setShareMaxDownloads(e.target.value)}
                            placeholder="Unlimited"
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs text-zinc-400 mb-1">Expires In (hours)</label>
                          <input
                            type="number"
                            value={shareExpiration}
                            onChange={(e) => setShareExpiration(e.target.value)}
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <Button
                        onClick={() => handleCreateShare(selectedExport.id)}
                        disabled={creatingShare}
                        size="sm"
                        className="w-full"
                      >
                        {creatingShare ? <span className="flex items-center gap-2"><Icons.spinner /> Generating...</span> : "🔗 Generate Share Link"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Export Logs */}
                {selectedExport.logs && selectedExport.logs.length > 0 && (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                    <h3 className="font-semibold text-white mb-3">Processing Log</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedExport.logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 text-xs">
                          <span className={`mt-0.5 rounded-full h-2 w-2 flex-shrink-0 ${
                            log.status === "completed" ? "bg-green-400" :
                            log.status === "failed" ? "bg-red-400" :
                            "bg-indigo-400"
                          }`} />
                          <div>
                            <span className="text-zinc-500">{new Date(log.created_at).toLocaleTimeString()}</span>
                            {log.stage && <span className="text-zinc-400 ml-2">[{log.stage}]</span>}
                            {log.message && <p className="text-zinc-300">{log.message}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center">
                <p className="text-4xl mb-3">📋</p>
                <p className="text-zinc-400 text-sm">Select an export to view details</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
