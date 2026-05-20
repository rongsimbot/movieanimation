"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listCharacters, updateCharacter, assignImageToCharacter,
  listAssets, getScriptBreakdown, getAssetUrl,
  Asset, getStoredUser, clearAuth, ScriptBreakdown,
} from "@/lib/api";

interface CharDisplay {
  id: number;
  character_name: string;
  character_type: string | null;
  description: string | null;
  appearance_notes: string | null;
  voice_notes: string | null;
  image_url: string | null;
  created_at?: string;
  last_modified?: string;
}
import { Button } from "@/components/ui/button";

export default function CharacterMappingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const projectId = parseInt(params.id, 10);
  const [breakdown, setBreakdown] = useState<ScriptBreakdown | null>(null);
  const [characters, setCharacters] = useState<CharDisplay[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingChar, setEditingChar] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ character_type: "", description: "", appearance_notes: "" });
  const [assigningFor, setAssigningFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const user = getStoredUser();

  useEffect(() => {
    if (!user) { router.push("/auth"); return; }
    loadAll();
  }, [projectId]);

  async function loadAll() {
    setLoading(true);
    try {
      // Load script breakdown for character list
      const bdResult = await getScriptBreakdown(projectId);
      if (bdResult.ok && bdResult.data) {
        setBreakdown(bdResult.data);
        setCharacters((bdResult.data.characters || []) as CharDisplay[]);
      }

      // Load character photos (assets)
      const assetResult = await listAssets({ asset_type: "character_photo", limit: 100 });
      if (assetResult.ok && assetResult.data) {
        setAssets(assetResult.data.assets);
      }
    } catch (err: any) {
      if (err.status === 401) { clearAuth(); router.push("/auth"); }
    }
    setLoading(false);
  }

  async function handleAssignAsset(characterId: number, assetId: number) {
    setSaving(true);
    setError("");
    const result = await assignImageToCharacter(characterId, assetId);
    if (result.ok) {
      setSuccess(`Image assigned to character!`);
      setAssigningFor(null);
      loadAll(); // Refresh
    } else {
      setError(result.error || "Assignment failed");
    }
    setSaving(false);
  }

  async function handleUpdateCharacter(charId: number) {
    setSaving(true);
    setError("");
    const result = await updateCharacter(charId, editForm);
    if (result.ok) {
      setSuccess("Character updated!");
      setEditingChar(null);
      loadAll();
    } else {
      setError(result.error || "Update failed");
    }
    setSaving(false);
  }

  function startEditing(char: CharDisplay) {
    setEditingChar(char.id);
    setEditForm({
      character_type: char.character_type || "",
      description: char.description || "",
      appearance_notes: char.appearance_notes || "",
    });
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
            <h1 className="text-lg font-bold text-white">🎭 Character Mapping</h1>
            <span className="text-sm text-zinc-500">{characters.length} characters</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push(`/project/${projectId}/assets`)}>
            📁 Asset Library
          </Button>
        </div>
        {/* Tab Nav */}
        <nav className="mx-auto max-w-7xl px-6 flex gap-1 -mb-px">
          {[
            { label: "📜 Script", href: `/project/${projectId}/script` },
            { label: "🎭 Characters", href: `/project/${projectId}/characters`, active: true },
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
        {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        {success && <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">{success}</div>}

        {!breakdown?.parsed ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">🎭</p>
            <h2 className="text-xl font-semibold text-white mb-2">No Characters Yet</h2>
            <p className="text-zinc-400 mb-4">Parse your script first to detect characters automatically.</p>
            <Button onClick={() => router.push(`/project/${projectId}/script`)}>
              Go to Script Editor
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {characters.map((char) => (
              <div key={char.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                {editingChar === char.id ? (
                  /* Edit Mode */
                  <div className="space-y-3">
                    <h3 className="font-semibold text-white">Edit: {char.character_name}</h3>
                    <select
                      value={editForm.character_type}
                      onChange={(e) => setEditForm({ ...editForm, character_type: e.target.value })}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                    >
                      <option value="">Select role...</option>
                      <option value="protagonist">Protagonist</option>
                      <option value="antagonist">Antagonist</option>
                      <option value="supporting">Supporting</option>
                      <option value="minor">Minor</option>
                      <option value="narrator">Narrator</option>
                    </select>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      placeholder="Character description"
                      rows={2}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                    />
                    <textarea
                      value={editForm.appearance_notes}
                      onChange={(e) => setEditForm({ ...editForm, appearance_notes: e.target.value })}
                      placeholder="Appearance notes (for AI image generation)"
                      rows={2}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleUpdateCharacter(char.id)} disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingChar(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Display Mode */
                  <>
                    <div className="flex items-start gap-4">
                      {/* Character Avatar */}
                      {char.image_url ? (
                        <img
                          src={char.image_url}
                          alt={char.character_name}
                          className="h-20 w-20 rounded-xl object-cover border border-zinc-700 flex-shrink-0"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-3xl flex-shrink-0">
                          {char.character_name.charAt(0)}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white">{char.character_name}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            char.character_type === "protagonist" ? "bg-blue-500/20 text-blue-400" :
                            char.character_type === "antagonist" ? "bg-red-500/20 text-red-400" :
                            "bg-zinc-700 text-zinc-400"
                          }`}>
                            {char.character_type || "Unknown"}
                          </span>
                        </div>
                        {char.description && (
                          <p className="text-sm text-zinc-400 mb-2 line-clamp-2">{char.description}</p>
                        )}
                        {char.appearance_notes && (
                          <p className="text-xs text-zinc-500 italic">🎨 {char.appearance_notes}</p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-800">
                      <button
                        onClick={() => startEditing(char)}
                        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => setAssigningFor(assigningFor === char.id ? null : char.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs transition ${
                          assigningFor === char.id
                            ? "bg-white text-zinc-900"
                            : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                        }`}
                      >
                        🖼️ {char.image_url ? "Change Image" : "Assign Image"}
                      </button>
                    </div>

                    {/* Asset Picker */}
                    {assigningFor === char.id && (
                      <div className="mt-3 pt-3 border-t border-zinc-700">
                        <p className="text-xs text-zinc-400 mb-2">Select an image from your asset library:</p>
                        {assets.length === 0 ? (
                          <p className="text-xs text-zinc-500">
                            No images uploaded yet.{" "}
                            <button
                              onClick={() => router.push(`/project/${projectId}/assets`)}
                              className="text-blue-400 hover:underline"
                            >
                              Upload some →
                            </button>
                          </p>
                        ) : (
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                            {assets.map((asset) => (
                              <button
                                key={asset.id}
                                onClick={() => handleAssignAsset(char.id, asset.id)}
                                disabled={saving}
                                className="relative aspect-square rounded-lg overflow-hidden border border-zinc-700 hover:border-white transition group"
                              >
                                <img
                                  src={getAssetUrl(asset.id)}
                                  alt={asset.file_name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect fill='%2327272a' width='24' height='24'/></svg>";
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                  <span className="text-xs text-white font-medium">Select</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Asset Quick Upload CTA */}
        {breakdown?.parsed && assets.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
            <p className="text-2xl mb-2">📁</p>
            <p className="text-sm text-zinc-300 mb-1">No character photos uploaded yet</p>
            <p className="text-xs text-zinc-500 mb-4">Upload images to assign faces to your characters</p>
            <Button onClick={() => router.push(`/project/${projectId}/assets`)}>
              Go to Asset Library
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
