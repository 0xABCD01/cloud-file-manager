"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import type { FileItem, FolderItem, FolderContents } from "@/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gzip")) return "📦";
  if (mimeType.startsWith("text/")) return "📝";
  return "📎";
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, checkAuth, logout } = useAuth();
  const [contents, setContents] = useState<FolderContents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadContents();
    }
  }, [isAuthenticated]);

  const loadContents = async () => {
    try {
      setLoading(true);
      // Load root folder contents (no folder_id = root)
      const data = await api.get<FolderContents>("/api/v1/folders/tree");
      // For now, show a simple file list
      const files = await api.get<{ items: FileItem[]; total: number }>("/api/v1/files/", {
        page: "1",
        per_page: "50",
      });
      setContents({
        folders: [],
        files: files.items.map((f) => ({ ...f, type: "file" as const })),
        total_items: files.total,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await api.upload("/api/v1/files/upload", file);
      await loadContents(); // Refresh
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm("Move this file to trash?")) return;
    try {
      await api.delete(`/api/v1/files/${fileId}`);
      await loadContents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDownload = async (fileId: string) => {
    try {
      const data = await api.get<{ download_url: string }>(`/api/v1/files/${fileId}/download`);
      window.open(data.download_url, "_blank");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse" style={{ color: "var(--muted)" }}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const storagePercent = user
    ? Math.round((user.storage_used_bytes / user.storage_quota_bytes) * 100)
    : 0;

  return (
    <div className="flex min-h-screen" style={{ background: "var(--surface)" }}>
      {/* Sidebar */}
      <aside
        className="flex w-64 flex-col border-r"
        style={{ borderColor: "var(--border)", background: "var(--background)" }}
      >
        <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
          <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>☁️ CloudVault</h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
            style={{ background: "var(--primary)", color: "white" }}
          >
            📁 My Files
          </button>
        </nav>

        {/* Storage indicator */}
        <div className="border-t p-4" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted)" }}>
            Storage
          </div>
          <div className="h-2 w-full rounded-full" style={{ background: "var(--border)" }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${Math.min(storagePercent, 100)}%`,
                background: storagePercent > 90 ? "#ef4444" : storagePercent > 70 ? "#f59e0b" : "#22c55e",
              }}
            />
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {user ? `${formatBytes(user.storage_used_bytes)} of ${formatBytes(user.storage_quota_bytes)}` : "—"}
          </div>
        </div>

        {/* User */}
        <div className="border-t p-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                {user?.display_name}
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {user?.email}
              </div>
            </div>
            <button
              onClick={() => { logout(); router.push("/login"); }}
              className="rounded p-1 text-sm hover:opacity-70"
              title="Sign out"
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: "var(--border)", background: "var(--background)" }}
        >
          <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
            My Files
          </h2>
          <div className="flex items-center gap-3">
            <label
              className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
              style={{ background: "var(--primary)" }}
            >
              ⬆️ Upload
              <input type="file" className="hidden" onChange={handleUpload} />
            </label>
          </div>
        </header>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 rounded-lg px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "var(--danger)", border: "1px solid #fecaca" }}>
            {error}
            <button onClick={() => setError("")} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-pulse" style={{ color: "var(--muted)" }}>Loading files...</div>
            </div>
          ) : contents && contents.files.length > 0 ? (
            <div
              className="overflow-hidden rounded-xl shadow-sm"
              style={{ border: "1px solid var(--border)", background: "var(--background)" }}
            >
              {/* Table header */}
              <div
                className="grid grid-cols-12 gap-4 border-b px-4 py-3 text-xs font-medium uppercase tracking-wider"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                <div className="col-span-5">Name</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-2">Size</div>
                <div className="col-span-2">Modified</div>
                <div className="col-span-1"></div>
              </div>

              {/* File rows */}
              {contents.files.map((file) => (
                <div
                  key={file.id}
                  className="grid grid-cols-12 gap-4 border-b px-4 py-3 text-sm transition-colors hover:opacity-90"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="col-span-5 flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                    <span>{getFileIcon(file.mime_type)}</span>
                    <span className="truncate font-medium">{file.name}</span>
                  </div>
                  <div className="col-span-2 flex items-center text-xs" style={{ color: "var(--muted)" }}>
                    {file.mime_type.split("/")[1]?.toUpperCase() || file.mime_type}
                  </div>
                  <div className="col-span-2 flex items-center text-xs" style={{ color: "var(--muted)" }}>
                    {formatBytes(file.size_bytes)}
                  </div>
                  <div className="col-span-2 flex items-center text-xs" style={{ color: "var(--muted)" }}>
                    {new Date(file.updated_at).toLocaleDateString()}
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleDownload(file.id)}
                      className="rounded p-1.5 text-xs hover:opacity-70"
                      title="Download"
                    >
                      ⬇️
                    </button>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="rounded p-1.5 text-xs hover:opacity-70"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center rounded-xl py-20" style={{ border: "2px dashed var(--border)" }}>
              <div className="mb-4 text-5xl">📂</div>
              <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
                No files yet
              </h3>
              <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                Drop files here or click Upload to get started
              </p>
              <label
                className="mt-4 cursor-pointer rounded-lg px-6 py-2.5 text-sm font-semibold text-white"
                style={{ background: "var(--primary)" }}
              >
                ⬆️ Upload your first file
                <input type="file" className="hidden" onChange={handleUpload} />
              </label>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
