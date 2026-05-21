"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  listAssets, uploadAssets, deleteAsset, updateAsset,
  getScriptBreakdown, Asset, AssetStats,
  getStoredUser, clearAuth, getAssetUrl,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

const ASSET_CATEGORIES = [
  { value: "all", label: "All", icon: "📁" },
  { value: "character_photo", label: "Characters", icon: "👤" },
  { value: "prop", label: "Props", icon: "🪑" },
  { value: "background", label: "Backgrounds", icon: "🖼️" },
];

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
  const [uploadPreview, setUploadPreview] = useState<string[]>([]);
  const [editingAsset, setEditingAsset] = useState<number | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [viewingImage, setViewingImage] = useState<string | null>(null);
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
    const params: any = { limit: 100 };
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
    setUploadPreview([]);

    // Show preview for images
    const previews: string[] = [];
    for (let i = 0; i < Math.min(files.length, 5); i++) {
      if (files[i].type.startsWith("image/")) {
        previews.push(URL.createObjectURL(files[i]));
      }
    }
    setUploadPreview(previews);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }
    formData.append("asset_type", filter !== "all" ? filter : "character_photo");

    const result = await uploadAssets(formData);
    if (result.ok) {
      const uploadedCount = result.data?.assets?.length || files.length;
      setSuccess(`✅ Uploaded ${uploadedCount} file(s)`);
      loadAssets();
    } else {
      setError(result.error || "Upload failed");
    }
    setUploading(false);
    // Clean up preview URLs
    previews.forEach((url) => URL.revokeObjectURL(url));
    setUploadPreview([]);
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

  async function handleUpdateCategory(assetId: number) {
    setUploading(true);
    const result = await updateAsset(assetId, { asset_type: editCategory });
    if (result.ok) {
      setSuccess("Asset category updated");
      setEditingAsset(null);
      loadAssets();
    } else {
      setError(result.error || "Update failed");
    }
    setUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }

  function getAssetTypeStyle(type: string) {
    switch (type) {
      case "character_photo": return "bg-blue-500/20 text-blue-400";
      case "prop": return "bg-amber-500/20 text-amber-400";
      case "background": return "bg-green-500/20 text-green-400";
      default: return "bg-zinc-700 text-zinc-400";
    }
  }

  function getAssetTypeLabel(type: string) {
    switch (type) {
      case "character_photo": return "Character";
      case "prop": return "Prop";
      case "background": return "Bg";
      default: return type;
    }
  }

  const filteredAssets = filter === "all"
    ? assets
    : assets.filter((a) => a.asset_type === filter);

  const totalStorage = stats
    ? stats.totalSize > 1024 * 1024
      ? `${(stats.totalSize / 1024 / 1024).toFixed(1)} MB`
      : `${(stats.totalSize / 1024).toFixed(1)} KB`
    : "—";

  if (loading && assets.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-500 border-t-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Image Lightbox */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setViewingImage(null)}
        >
          <button
            onClick={() => setViewingImage(null)}
            className="absolute top-4 right-4 text-white text-3xl hover:text-zinc-400 transition"
          >
            ✕
          </button>
          <img
            src={viewingImage}
            alt="Preview"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push(`/project/${projectId}`)} className="text-zinc-400 hover:text-white transition">← Project</button>
            <h1 className="text-lg font-bold text-white">📁 Asset Library</h1>
            {projectTitle && <span className="text-sm text-zinc-500">— {projectTitle}</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600">{totalStorage} used</span>
            <Button variant="outline" size="sm" onClick={() => router.push(`/project/${projectId}`)}>
              Dashboard
            </Button>
          </div>
        </div>
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
        {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {success && <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">{success}</div>}

        {/* Stats Bar */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {ASSET_CATEGORIES.map((cat) => {
              const count = cat.value === "all" ? stats.totalAssets :
                cat.value === "character_photo" ? stats.characterPhotos :
                cat.value === "prop" ? stats.props :
                stats.backgrounds;
              return (
                <button
                  key={cat.value}
                  onClick={() => setFilter(cat.value)}
                  className={`rounded-xl border p-3 text-center transition ${
                    filter === cat.value
                      ? "border-white bg-white/10"
                      : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
                  }`}
                >
                  <div className="text-lg">{cat.icon}</div>
                  <div className="text-xl font-bold text-white">{count}</div>
                  <div className="text-xs text-zinc-500">{cat.label}</div>
                </button>
              );
            })}
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

          <div className="flex gap-1.5 ml-auto">
            {ASSET_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => { setFilter(cat.value); setEditingAsset(null); }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filter === cat.value
                    ? "bg-white text-zinc-900"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {cat.icon} {cat.value === "all" ? "All" : cat.label}
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
          {uploadPreview.length > 0 ? (
            <div className="flex gap-2 justify-center mb-3">
              {uploadPreview.map((url, i) => (
                <img key={i} src={url} alt={`Preview ${i + 1}`} className="h-16 w-16 object-cover rounded-lg" />
              ))}
            </div>
          ) : (
            <p className="text-3xl mb-2">🖼️</p>
          )}
          <p className="text-sm text-zinc-400">
            {uploading ? "Uploading..." : "Drag & drop images here, or click Upload button"}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            JPG, PNG, GIF, WebP, SVG — up to 50MB each
          </p>
        </div>

        {/* Asset Grid */}
        {filteredAssets.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-zinc-400">No {filter !== "all" ? filter.replace(/_/g, " ") : ""} assets yet. Upload some images to get started!</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 text-sm text-blue-400 hover:text-blue-300 transition"
            >
              📤 Upload your first image →
            </button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className="group relative rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden hover:border-zinc-600 transition"
              >
                {/* Image Preview */}
                <div
                  className="aspect-square bg-zinc-800 flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => {
                    if (asset.mime_type?.startsWith("image/")) {
                      setViewingImage(getAssetUrl(asset.id));
                    }
                  }}
                >
                  {asset.mime_type?.startsWith("image/") ? (
                    <img
                      src={getAssetUrl(asset.id)}
                      alt={asset.file_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-3xl">📄</span>
                  )}
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition flex flex-col justify-end p-2">
                  <div className="flex gap-1 justify-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewingImage(getAssetUrl(asset.id)); }}
                      className="rounded-lg bg-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/30 transition"
                    >
                      🔍
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingAsset(editingAsset === asset.id ? null : asset.id);
                        setEditCategory(asset.asset_type);
                      }}
                      className="rounded-lg bg-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/30 transition"
                      title="Change category"
                    >
                      🏷️
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                      className="rounded-lg bg-red-500/20 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/30 transition"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Category Edit */}
                {editingAsset === asset.id && (
                  <div className="absolute bottom-0 left-0 right-0 bg-zinc-900/95 p-2 border-t border-zinc-700 z-10">
                    <div className="flex gap-1">
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="flex-1 rounded bg-zinc-800 border border-zinc-700 text-xs text-white px-2 py-1"
                      >
                        <option value="character_photo">Character Photo</option>
                        <option value="prop">Prop</option>
                        <option value="background">Background</option>
                      </select>
                      <button
                        onClick={() => handleUpdateCategory(asset.id)}
                        disabled={uploading}
                        className="rounded bg-white text-zinc-900 px-2 py-1 text-xs font-medium hover:bg-zinc-200 transition"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingAsset(null)}
                        className="rounded bg-zinc-700 text-zinc-300 px-2 py-1 text-xs hover:bg-zinc-600 transition"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {/* Info footer */}
                <div className="p-2">
                  <p className="text-xs text-zinc-300 truncate" title={asset.file_name}>
                    {asset.file_name.length > 20
                      ? asset.file_name.slice(0, 17) + "..."
                      : asset.file_name}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-zinc-600">{asset.fileSizeFormatted}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getAssetTypeStyle(asset.asset_type)}`}>
                      {getAssetTypeLabel(asset.asset_type)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">🔗 Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/project/${projectId}/characters`)}
            >
              🎭 Assign images to characters
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/project/${projectId}/script`)}
            >
              📜 Back to Script Editor
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/project/${projectId}/timeline`)}
            >
              ✂️ Timeline Editor
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}