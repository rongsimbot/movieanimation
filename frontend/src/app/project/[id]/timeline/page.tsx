"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getStoredUser, getScriptBreakdown, ScriptBreakdown,
  getTimeline, getTimelines, createTimeline, deleteTimeline,
  addClipToTimeline, updateClip, removeClip, reorderClips,
  startAssembly, getAssemblyStatus,
  TimelineData, TimelineWithClips, TimelineClipData,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────────

interface DragState {
  clipId: number;
  fromIndex: number;
}

// ─── Transition Selector Component ──────────────────────────────

function TransitionSelector({
  currentType,
  currentDuration,
  onChange,
}: {
  currentType: string;
  currentDuration: number;
  onChange: (type: string, duration: number) => void;
}) {
  const transitions = [
    { value: 'cut', label: '✂️ Cut', description: 'Instant switch' },
    { value: 'fade', label: '🌑 Fade', description: 'Fade to black' },
    { value: 'dissolve', label: '🔄 Dissolve', description: 'Cross-fade blend' },
  ];

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-zinc-500 shrink-0">→</span>
      <select
        value={currentType}
        onChange={(e) => onChange(e.target.value, currentDuration)}
        className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-zinc-200 text-xs focus:border-violet-500 focus:outline-none"
      >
        {transitions.map((t) => (
          <option key={t.value} value={t.value} title={t.description}>
            {t.label}
          </option>
        ))}
      </select>
      {currentType !== 'cut' && (
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            min="100"
            max="2000"
            step="100"
            value={currentDuration || 500}
            onChange={(e) => onChange(currentType, parseInt(e.target.value))}
            className="w-16 h-1 accent-violet-500"
          />
          <span className="text-zinc-500 w-12 tabular-nums">
            {(currentDuration / 1000).toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Clip Card Component ────────────────────────────────────────

function ClipCard({
  clip,
  index,
  totalClips,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onTransitionChange,
  onRemove,
}: {
  clip: TimelineClipData;
  index: number;
  totalClips: number;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: number, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onTransitionChange: (clipId: number, type: string, duration: number) => void;
  onRemove: (clipId: number) => void;
}) {
  return (
    <>
      {/* Transition row (between clips) */}
      {index > 0 && (
        <TransitionSelector
          currentType={clip.transition_type}
          currentDuration={clip.transition_duration_ms}
          onChange={(type, duration) => onTransitionChange(clip.id, type, duration)}
        />
      )}

      {/* Clip card */}
      <div
        draggable
        onDragStart={(e) => onDragStart(e, clip.id, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDragEnd={onDragEnd}
        className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all cursor-grab active:cursor-grabbing ${
          isDragging
            ? 'border-violet-500 bg-violet-500/10 opacity-50'
            : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
        }`}
      >
        {/* Grip handle */}
        <div className="text-zinc-600 group-hover:text-zinc-400 transition select-none text-lg">
          ⠿
        </div>

        {/* Clip number */}
        <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center text-xs font-bold">
          {index + 1}
        </div>

        {/* Clip info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white truncate font-medium">
              {clip.label || `Clip ${clip.clip_order + 1}`}
            </span>
            <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">
              {clip.transition_type === 'cut' ? '✂️' : clip.transition_type === 'fade' ? '🌑' : '🔄'}
              {clip.transition_type !== 'cut' && ` ${(clip.transition_duration_ms / 1000).toFixed(1)}s`}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {clip.duration_seconds && (
              <span className="text-[11px] text-zinc-500">
                {clip.duration_seconds.toFixed(1)}s
              </span>
            )}
            {clip.clip_source && (
              <span className="text-[10px] text-zinc-600 truncate max-w-[200px]">
                {clip.clip_source.split('/').pop()}
              </span>
            )}
          </div>
        </div>

        {/* Remove button */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(clip.id); }}
          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-1"
          title="Remove clip"
        >
          ✕
        </button>
      </div>
    </>
  );
}

// ─── Main Timeline Page ─────────────────────────────────────────

export default function TimelinePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const projectId = parseInt(params.id, 10);
  const user = getStoredUser();

  // State
  const [timelines, setTimelines] = useState<TimelineData[]>([]);
  const [activeTimeline, setActiveTimeline] = useState<TimelineWithClips | null>(null);
  const [breakdown, setBreakdown] = useState<ScriptBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assemblyStatus, setAssemblyStatus] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [showNewTimeline, setShowNewTimeline] = useState(false);
  const [newTimelineName, setNewTimelineName] = useState("");
  const [showAddScene, setShowAddScene] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Data Loading ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    // Load timelines
    const tlResult = await getTimelines(projectId);
    if (tlResult.ok && tlResult.data) {
      setTimelines(tlResult.data.timelines);
    }

    // Load script breakdown for available scenes
    const bdResult = await getScriptBreakdown(projectId);
    if (bdResult.ok && bdResult.data) {
      setBreakdown(bdResult.data);
    }

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!user) { router.push("/auth"); return; }
    loadData();
  }, [loadData, user, router]);

  // Load active timeline when selected
  const selectTimeline = async (id: number) => {
    setActiveTimeline(null);
    const result = await getTimeline(id);
    if (result.ok && result.data) {
      setActiveTimeline(result.data.timeline);
    }
  };

  // Poll assembly status
  useEffect(() => {
    if (activeTimeline?.status === 'assembling') {
      pollRef.current = setInterval(async () => {
        const result = await getAssemblyStatus(activeTimeline.id);
        if (result.ok && result.data) {
          setAssemblyStatus(result.data.timelineStatus);
          if (result.data.timelineStatus === 'completed' || result.data.timelineStatus === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            // Reload timeline to get updated data
            selectTimeline(activeTimeline.id);
          }
        }
      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeTimeline?.status, activeTimeline?.id]);

  // ─── Timeline CRUD ─────────────────────────────────────────

  const handleCreateTimeline = async () => {
    const name = newTimelineName.trim() || `Timeline ${timelines.length + 1}`;
    const result = await createTimeline({ project_id: projectId, name });
    if (result.ok && result.data) {
      setTimelines([result.data.timeline, ...timelines]);
      setNewTimelineName("");
      setShowNewTimeline(false);
      selectTimeline(result.data.timeline.id);
    }
  };

  const handleDeleteTimeline = async (id: number) => {
    if (!confirm("Delete this timeline? All clips will be lost.")) return;
    const result = await deleteTimeline(id);
    if (result.ok) {
      setTimelines(timelines.filter(t => t.id !== id));
      if (activeTimeline?.id === id) setActiveTimeline(null);
    }
  };

  // ─── Clip Management ───────────────────────────────────────

  const handleAddScene = async (sceneId: number, sceneTitle: string) => {
    if (!activeTimeline) return;
    const clipCount = activeTimeline.clips.length;
    const result = await addClipToTimeline(activeTimeline.id, {
      scene_id: sceneId,
      clip_source: '', // Will be filled when generation completes
      clip_order: clipCount,
      label: sceneTitle,
      duration_seconds: 5,
    });
    if (result.ok && result.data) {
      setActiveTimeline({
        ...activeTimeline,
        clips: [...activeTimeline.clips, result.data.clip],
      });
    }
    setShowAddScene(false);
  };

  const handleTransitionChange = async (clipId: number, type: string, duration: number) => {
    if (!activeTimeline) return;
    const result = await updateClip(activeTimeline.id, clipId, {
      transition_type: type,
      transition_duration_ms: duration,
    });
    if (result.ok && result.data) {
      setActiveTimeline({
        ...activeTimeline,
        clips: activeTimeline.clips.map(c =>
          c.id === clipId ? result.data!.clip : c
        ),
      });
    }
  };

  const handleRemoveClip = async (clipId: number) => {
    if (!activeTimeline) return;
    const result = await removeClip(activeTimeline.id, clipId);
    if (result.ok) {
      setActiveTimeline({
        ...activeTimeline,
        clips: activeTimeline.clips.filter(c => c.id !== clipId),
      });
    }
  };

  // ─── Drag & Drop ───────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, clipId: number, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(clipId));
    setDragState({ clipId, fromIndex: index });
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragEnd = async () => {
    if (!activeTimeline || !dragState || dragOverIndex === null || dragOverIndex === dragState.fromIndex) {
      setDragState(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder locally first for instant feedback
    const clips = [...activeTimeline.clips];
    const [moved] = clips.splice(dragState.fromIndex, 1);
    clips.splice(dragOverIndex, 0, moved);

    // Update clip_order values
    const reordered = clips.map((c, i) => ({ ...c, clip_order: i }));
    setActiveTimeline({ ...activeTimeline, clips: reordered });

    // Persist to backend
    const orderUpdates = reordered.map((c, i) => ({ id: c.id, clip_order: i }));
    await reorderClips(activeTimeline.id, orderUpdates);

    setDragState(null);
    setDragOverIndex(null);
  };

  // ─── Assembly ──────────────────────────────────────────────

  const handleStartAssembly = async () => {
    if (!activeTimeline) return;
    const result = await startAssembly(activeTimeline.id);
    if (result.ok && result.data) {
      setAssemblyStatus('assembling');
      setActiveTimeline({ ...activeTimeline, status: 'assembling' });
    } else {
      setError(result.error || "Failed to start assembly");
    }
  };

  // ─── Render ────────────────────────────────────────────────

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
            <button onClick={() => router.push(`/project/${projectId}`)} className="text-zinc-400 hover:text-white transition">← Back</button>
            <h1 className="text-lg font-bold text-white">✂️ Timeline Editor</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">{user?.name}</span>
          </div>
        </div>

        {/* Project tabs */}
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
              className={`px-4 py-2.5 text-sm transition border-b-2 ${
                tab.href.includes('/timeline')
                  ? 'text-white border-violet-500'
                  : 'text-zinc-400 hover:text-white border-transparent hover:border-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
            <button onClick={() => setError("")} className="ml-3 text-red-300 hover:text-white">✕</button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-4">
          {/* ── Sidebar: Timeline List ─────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Timelines</h2>
                <button
                  onClick={() => setShowNewTimeline(!showNewTimeline)}
                  className="text-violet-400 hover:text-violet-300 text-xs transition"
                >
                  + New
                </button>
              </div>

              {showNewTimeline && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Timeline name..."
                    value={newTimelineName}
                    onChange={(e) => setNewTimelineName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTimeline()}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateTimeline}
                      className="flex-1 rounded-lg bg-violet-500 px-3 py-1.5 text-sm text-white hover:bg-violet-600 transition"
                    >
                      Create
                    </button>
                    <button
                      onClick={() => setShowNewTimeline(false)}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Timeline list */}
              <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                {timelines.length === 0 && !showNewTimeline && (
                  <p className="text-sm text-zinc-600 py-4 text-center">
                    No timelines yet. Create one to start assembling your movie.
                  </p>
                )}
                {timelines.map((tl) => (
                  <button
                    key={tl.id}
                    onClick={() => selectTimeline(tl.id)}
                    className={`w-full text-left rounded-xl px-4 py-3 transition-all ${
                      activeTimeline?.id === tl.id
                        ? 'border border-violet-500/50 bg-violet-500/10'
                        : 'border border-transparent bg-zinc-900/40 hover:bg-zinc-900/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{tl.name}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {tl.output_resolution} • {tl.status}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTimeline(tl.id); }}
                        className="text-zinc-700 hover:text-red-400 transition text-xs opacity-0 group-hover:opacity-100 ml-2"
                      >
                        ✕
                      </button>
                    </div>
                    {/* Status indicator */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                        tl.status === 'completed' ? 'bg-green-400' :
                        tl.status === 'assembling' ? 'bg-amber-400 animate-pulse' :
                        tl.status === 'failed' ? 'bg-red-400' :
                        'bg-zinc-600'
                      }`} />
                      <span className="text-[10px] text-zinc-500 capitalize">{tl.status}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Main: Timeline Editor ──────────────────────────── */}
          <div className="lg:col-span-3 space-y-6">
            {!activeTimeline ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-6xl mb-4">✂️</div>
                <h2 className="text-xl font-semibold text-white mb-2">Select or Create a Timeline</h2>
                <p className="text-zinc-500 max-w-md">
                  Timelines hold your scene clips in order. Add clips from your script breakdown,
                  arrange them with drag-and-drop, set transitions, and assemble into a movie.
                </p>
                <Button
                  onClick={() => setShowNewTimeline(true)}
                  className="mt-6 bg-violet-500 hover:bg-violet-600"
                >
                  + Create First Timeline
                </Button>
              </div>
            ) : (
              <>
                {/* Timeline Header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-white">{activeTimeline.name}</h2>
                    <p className="text-sm text-zinc-500">
                      {activeTimeline.clips.length} clip{activeTimeline.clips.length !== 1 ? 's' : ''}
                      {activeTimeline.status === 'assembling' && ' • Assembling...'}
                      {activeTimeline.status === 'completed' && ' • Assembly complete ✅'}
                      {activeTimeline.output_path && (
                        <span className="text-green-400 ml-2">• Output ready</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddScene(!showAddScene)}
                      className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm hover:bg-zinc-800 transition"
                    >
                      + Add Scene
                    </button>
                    <Button
                      onClick={handleStartAssembly}
                      disabled={activeTimeline.clips.length === 0 || activeTimeline.status === 'assembling'}
                      className="bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {activeTimeline.status === 'assembling' ? '🔄 Assembling...' : '🎬 Assemble Movie'}
                    </Button>
                  </div>
                </div>

                {/* Assembly progress */}
                {activeTimeline.status === 'assembling' && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                      <div>
                        <p className="text-sm font-medium text-amber-400">
                          Assembling your movie...
                        </p>
                        <p className="text-xs text-amber-500/70">
                          This may take a few minutes depending on clip count and transitions.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTimeline.status === 'completed' && (
                  <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🎉</span>
                      <div>
                        <p className="text-sm font-medium text-green-400">Movie assembled successfully!</p>
                        <p className="text-xs text-green-500/70">
                          {activeTimeline.output_path && `Output: ${activeTimeline.output_path.split('/').pop()}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTimeline.status === 'failed' && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                    <p className="text-sm text-red-400">Assembly failed. Check the assembly logs for details.</p>
                  </div>
                )}

                {/* Add Scene Panel */}
                {showAddScene && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-zinc-300">
                        Add Scenes from Script
                      </h3>
                      <button onClick={() => setShowAddScene(false)} className="text-zinc-500 hover:text-white">
                        ✕
                      </button>
                    </div>
                    {breakdown?.scenes && breakdown.scenes.length > 0 ? (
                      <div className="grid gap-2 max-h-64 overflow-y-auto">
                        {breakdown.scenes.map((scene) => (
                          <button
                            key={scene.id}
                            onClick={() => handleAddScene(scene.id, scene.scene_title || `Scene ${scene.scene_number}`)}
                            className="text-left rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 hover:bg-zinc-800 transition"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-white">
                                Scene {scene.scene_number}: {scene.scene_title || 'Untitled'}
                              </span>
                              <span className="text-xs text-zinc-500">
                                {scene.duration_seconds || '?'}s
                              </span>
                            </div>
                            {scene.description && (
                              <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-1">
                                {scene.description}
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500 py-4 text-center">
                        No parsed scenes found. Parse your script first.
                      </p>
                    )}
                  </div>
                )}

                {/* Clip List */}
                {activeTimeline.clips.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-800 py-16 text-center">
                    <p className="text-4xl mb-3">🎬</p>
                    <p className="text-zinc-500 mb-4">No clips in this timeline yet</p>
                    <button
                      onClick={() => setShowAddScene(true)}
                      className="text-violet-400 hover:text-violet-300 transition text-sm"
                    >
                      + Add scenes from your script
                    </button>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {/* Drag & drop instructions */}
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-zinc-600">
                        Drag clips to reorder • Click transition arrows to change effects
                      </p>
                      <p className="text-xs text-zinc-600">
                        Total: {activeTimeline.clips.length} clip{activeTimeline.clips.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    {activeTimeline.clips.map((clip, index) => (
                      <ClipCard
                        key={clip.id}
                        clip={clip}
                        index={index}
                        totalClips={activeTimeline.clips.length}
                        isDragging={dragState?.clipId === clip.id}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                        onTransitionChange={handleTransitionChange}
                        onRemove={handleRemoveClip}
                      />
                    ))}

                    {/* End marker */}
                    <div className="flex items-center gap-3 py-2 px-4 text-xs text-zinc-600">
                      <span>🏁</span>
                      <span>End of movie</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
