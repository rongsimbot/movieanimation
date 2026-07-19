"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createScript, getStoredUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Film, Loader2, Upload, FileText } from "lucide-react";

export default function NewProjectPage() {
  const router = useRouter();
  const user = getStoredUser();

  const [mode, setMode] = useState<"upload" | "write">("write");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Please enter a project title.");
      return;
    }

    if (mode === "write" && !content.trim()) {
      setError("Please write or paste your script content.");
      return;
    }

    if (mode === "upload" && !file) {
      setError("Please select a script file to upload.");
      return;
    }

    setLoading(true);

    try {
      let scriptId: number;

      if (mode === "upload" && file) {
        // Upload file first
        const { uploadScriptFile } = await import("@/lib/api");
        const result = await uploadScriptFile(file);
        if (!result.ok) {
          setError(result.error || "Failed to upload script file.");
          setLoading(false);
          return;
        }
        // Create script with extracted text
        const scriptResult = await createScript({
          script_title: title,
          script_content: result.data!.extractedText,
          genre: genre || result.data!.detectedGenre || undefined,
          source_filename: result.data!.fileName,
        });
        if (scriptResult.ok && scriptResult.data) {
          scriptId = scriptResult.data.script.id;
        } else {
          setError(scriptResult.error || "Failed to create script.");
          setLoading(false);
          return;
        }
      } else {
        const result = await createScript({
          script_title: title,
          script_content: content,
          genre: genre || undefined,
        });
        if (result.ok && result.data) {
          scriptId = result.data.script.id;
        } else {
          setError(result.error || "Failed to create script.");
          setLoading(false);
          return;
        }
      }

      // Navigate to the project's script editor
      router.push(`/project/${scriptId}/script`);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      // Auto-fill title from filename if empty
      if (!title) {
        const name = selected.name.replace(/\.[^.]+$/, "");
        setTitle(name);
      }
    }
  };

  if (!user) {
    router.push("/auth");
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-zinc-400 hover:text-white transition"
            >
              ← Dashboard
            </button>
            <h1 className="text-lg font-bold text-white">🎬 New Project</h1>
          </div>
          <span className="text-sm text-zinc-500">{user.name}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Create a New Movie Project</h2>
          <p className="text-zinc-400">
            Start by uploading your script or writing one from scratch.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="mb-8 flex rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
          <button
            onClick={() => setMode("upload")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              mode === "upload"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload Script
          </button>
          <button
            onClick={() => setMode("write")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              mode === "write"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <FileText className="w-4 h-4" />
            Write from Scratch
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-zinc-300 mb-2">
              Project Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., The Last Algorithm"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition"
              required
            />
          </div>

          {/* Genre */}
          <div>
            <label htmlFor="genre" className="block text-sm font-medium text-zinc-300 mb-2">
              Genre
            </label>
            <input
              id="genre"
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="e.g., sci-fi, drama, comedy"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition"
            />
          </div>

          {/* Upload Mode */}
          {mode === "upload" && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Script File (.txt, .pdf, .docx)
              </label>
              <div
                className={`relative rounded-xl border-2 border-dashed p-8 text-center transition cursor-pointer ${
                  file
                    ? "border-purple-500/50 bg-purple-500/5"
                    : "border-zinc-700 hover:border-zinc-600 bg-zinc-900/20"
                }`}
              >
                <input
                  type="file"
                  accept=".txt,.pdf,.docx"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-3" />
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-white">{file.name}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {(file.size / 1024).toFixed(1)} KB &bull; {file.type || "unknown type"}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-zinc-400">
                      Drop your script file here or click to browse
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">
                      Supports .txt, .pdf, and .docx formats
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Write Mode */}
          {mode === "write" && (
            <div>
              <label htmlFor="content" className="block text-sm font-medium text-zinc-300 mb-2">
                Script Content *
              </label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`Write or paste your script here...

Use standard script format:
INT. COFFEE SHOP - DAY

JOHN
(sipping coffee)
I can't believe this is happening.

SARAH
We need to leave. Now.`}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-4 font-mono text-sm text-white placeholder-zinc-500 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition resize-y"
                rows={16}
                required
              />
              <p className="mt-2 text-xs text-zinc-600">
                {content.split(/\s+/).filter(Boolean).length.toLocaleString()} words &bull;{" "}
                {content.split("\n").length.toLocaleString()} lines
              </p>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 h-12 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-600/20 font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {mode === "upload" ? "Creating Project..." : "Creating Project..."}
                </>
              ) : (
                <>🎬 Create Project</>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/dashboard")}
              className="border-zinc-700 text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
