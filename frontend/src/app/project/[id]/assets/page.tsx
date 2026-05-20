"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  listAssets, uploadAssets, deleteAsset, getScriptBreakdown,
  Asset, AssetStats, getStoredUser, clearAuth, getAssetUrl,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function AssetLibraryPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const projectId = parseInt(params.id, 10);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stats, setStats] = useState<AssetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const user = getStoredUser();

  useEffect(() => {
    if (!user) { router.push("/auth"); return; }
    loadAssets();
    loadProjectInfo();
  }, [projectId, filter]);

  async function loadProjectInfo() {
    try {
      const result = await getScriptBreakdown(projectId);
      if (result.ok && result.data?.script) {
        setProjectTitle(result.data.script.script_title);
      }
    } catch {}
  }

  async function loadAssets() {
    setLoading(true);
    const params: any = { limit: 50 };
    if (filter !== "all") params.asset_type = filter;
    const result = await listAssets(params);
    if (result.ok && result.data) {
      setAssets(result.data.assets);
      setStats(result.data.stats);
    } else if (result.status === 401) {
      clearAuth();
      router.push("/auth");
    }
    setLoading(false);
  }

  async function handleUpload(files: FileList) {
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    setSuccess("");

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    formData.append("asset_type", filter !== "all" ? filter : "character_photo");

    const result = await uploadAssets(formData);
    if (result.ok) {
      setSuccess(`Uploaded ${files.length} file(s)`);
      loadAssets();
    } else {
      setError(result.error || "Upload failed");
    }
    setUploading(false);
  }

  async function handleDelete(assetId: number) {
    if (!confirm("Delete this asset? This cannot be undone.")) return;
    const result = await deleteAsset(assetId);
    if (result.ok) {
      setSuccess("Asset deleted");
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    } else {
      setError(result.error || "Delete failed");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }

  const filteredAssets = filter === "all"
    ? assets
    : assets.filter((a) => a.asset_type === filter);

  if (loading && assets.length === 0) {
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
            <h1 className="text-lg font-bold text-white">📁 Asset Library</h1>
            {projectTitle && <span className="text-sm text-zinc-500">— {projectTitle}</span>}
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push(`/project/${projectId}`)}>
            Dashboard
          </Button>
        </div>
        {/* Tab Nav */}
        <nav className="mx-auto max-w-7xl px-6 flex gap-1 -mb-px">
          {[
            { label: "📜 Script", href: `/project/${projectId}/script` },
            { label: "🎭 Characters", href: `/project/${projectId}/characters` },
            { label: "📁 Assets", href: `/project/${projectId}/assets`, active: true },
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
        {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {success && <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">{success}</div>}

        {/* Stats Bar */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total", value: stats.totalAssets, icon: "📁" },
              { label: "Characters", value: stats.characterPhotos, icon: "👤" },
              { label: "Props", value: stats.props, icon: "🪑" },
              { label: "Backgrounds", value: stats.backgrounds, icon: "🖼️" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
                <div className="text-lg">{s.icon}</div>
                <div className="text-xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-zinc-500">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Zone + Filter */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "⏳ Uploading..." : "📤 Upload Images"}
          </Button>

          {/* Filter Pills */}
          <div className="flex gap-1.5 ml-auto">
            {["all", "character_photo", "prop", "background"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filter === f
                    ? "bg-white text-zinc-900"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {f === "all" ? "All" : f === "character_photo" ? "Characters" : f === "prop" ? "Props" : "Backgrounds"}
              </button>
            ))}
          </div>
        </div>

        {/* Drag & Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`mb-6 rounded-xl border-2 border-dashed p-8 text-center transition ${
            dragOver
              ? "border-blue-400 bg-blue-500/10"
              : "border-zinc-700 bg-zinc-900/30"
          }`}
        >
          <p className="text-3xl mb-2">🖼️</p>
          <p className="text-sm text-zinc-400">
            Drag & drop images here, or click Upload button
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            JPG, PNG, GIF, WebP — up to 50MB each
          </p>
        </div>

        {/* Asset Grid */}
        {filteredAssets.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-zinc-400">No assets yet. Upload some images to get started!</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className="group relative rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden hover:border-zinc-600 transition"
              >
                {/* Image Preview */}
                <div className="aspect-square bg-zinc-800 flex items-center justify-center overflow-hidden">
                  {asset.mime_type?.startsWith("image/") ? (
                    <img
                      src={getAssetUrl(asset.id)}
                      alt={asset.file_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-3xl">📄</span>
                  )}
                </div>

                {/* Overlay Actions */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-2 p-2">
                  <a
                    href={getAssetUrl(asset.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-white/20 px-3 py-1 text-xs text-white hover:bg-white/30 transition"
                  >
                    🔍 View
                  </a>
                  <button
                    onClick={() => handleDelete(asset.id)}
                    className="rounded-lg bg-red-500/20 px-3 py-1 text-xs text-red-300 hover:bg-red-500/30 transition"
                  >
                    🗑️ Delete
                  </button>
                </div>

                {/* Info */}
                <div className="p-2">
                  <p className="text-xs text-zinc-300 truncate" title={asset.file_name}>
                    {asset.file_name}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-zinc-600">{asset.fileSizeFormatted}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      asset.asset_type === "character_photo" ? "bg-blue-500/20 text-blue-400" :
                      asset.asset_type === "prop" ? "bg-amber-500/20 text-amber-400" :
                      "bg-green-500/20 text-green-400"
                    }`}>
                      {asset.asset_type === "character_photo" ? "Char" : asset.asset_type}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
