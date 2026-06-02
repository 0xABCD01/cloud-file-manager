/**
 * Upload drop zone with react-dropzone integration.
 *
 * Provides:
 * - Full-screen drop overlay when dragging files over the window
 * - Multiple file and folder upload support
 * - Per-file upload progress (progress bar + percentage)
 * - Upload queue with pending, uploading, complete, and failed states
 * - Cancel individual uploads
 * - Retry failed uploads
 * - Toast notification on completion
 * - Quota exceeded handling
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useUploadFile } from "@/hooks/useFiles";

/** Upload queue entry status. */
type UploadStatus = "pending" | "uploading" | "complete" | "failed" | "cancelled";

interface UploadEntry {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
  abortController?: AbortController;
}

interface UploadZoneProps {
  /** Current folder ID to upload into. */
  folderId?: string;
  /** Called when a toast message should be displayed. */
  onToast?: (message: string, type: "success" | "error") => void;
  /** Children rendered inside the drop zone. */
  children: React.ReactNode;
}

/** Generate a unique ID for upload entries. */
function generateId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function UploadZone({ folderId, onToast, children }: UploadZoneProps) {
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [globalDragActive, setGlobalDragActive] = useState(false);
  const dragCounterRef = useRef(0);
  const uploadMutation = useUploadFile();

  /** Process the upload queue — pick up pending items. */
  const processQueue = useCallback(() => {
    setUploads((prev) => {
      const pending = prev.filter((u) => u.status === "pending");
      const uploading = prev.filter((u) => u.status === "uploading");

      // Allow up to 3 concurrent uploads
      const slots = 3 - uploading.length;
      if (slots <= 0) return prev;

      const toStart = pending.slice(0, slots);
      for (const entry of toStart) {
        const abortController = new AbortController();

        // Mark as uploading
        setUploads((p) =>
          p.map((u) =>
            u.id === entry.id
              ? { ...u, status: "uploading" as const, abortController }
              : u,
          ),
        );

        uploadMutation.mutate(
          {
            file: entry.file,
            folderId,
            signal: abortController.signal,
            onProgress: (pct) => {
              setUploads((p) =>
                p.map((u) => (u.id === entry.id ? { ...u, progress: pct } : u)),
              );
            },
          },
          {
            onSuccess: () => {
              setUploads((p) =>
                p.map((u) =>
                  u.id === entry.id
                    ? { ...u, status: "complete" as const, progress: 100 }
                    : u,
                ),
              );
              onToast?.(`${entry.file.name} uploaded successfully`, "success");
            },
            onError: (err) => {
              if (abortController.signal.aborted) {
                setUploads((p) =>
                  p.map((u) =>
                    u.id === entry.id
                      ? { ...u, status: "cancelled" as const }
                      : u,
                  ),
                );
                return;
              }

              const message =
                err instanceof Error ? err.message : "Upload failed";

              // Quota exceeded detection
              if (
                message.toLowerCase().includes("quota") ||
                message.toLowerCase().includes("storage")
              ) {
                onToast?.(
                  "Storage quota exceeded. Please free up space.",
                  "error",
                );
              }

              setUploads((p) =>
                p.map((u) =>
                  u.id === entry.id
                    ? { ...u, status: "failed" as const, error: message }
                    : u,
                ),
              );
            },
          },
        );
      }

      return prev;
    });
  }, [folderId, uploadMutation, onToast]);

  // Trigger queue processing whenever uploads change
  useEffect(() => {
    processQueue();
  }, [processQueue]);

  /** Add files to the upload queue. */
  const addToQueue = useCallback((files: File[]) => {
    const entries: UploadEntry[] = files.map((file) => ({
      id: generateId(),
      file,
      status: "pending" as const,
      progress: 0,
    }));
    setUploads((prev) => [...prev, ...entries]);
  }, []);

  /** Cancel a specific upload. */
  const cancelUpload = useCallback((id: string) => {
    setUploads((prev) => {
      const entry = prev.find((u) => u.id === id);
      if (entry?.abortController) {
        entry.abortController.abort();
      }
      return prev.map((u) =>
        u.id === id ? { ...u, status: "cancelled" as const } : u,
      );
    });
  }, []);

  /** Retry a failed upload. */
  const retryUpload = useCallback((id: string) => {
    setUploads((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, status: "pending" as const, progress: 0, error: undefined }
          : u,
      ),
    );
  }, []);

  /** Clear completed / cancelled / failed uploads. */
  const clearFinished = useCallback(() => {
    setUploads((prev) =>
      prev.filter(
        (u) =>
          u.status !== "complete" &&
          u.status !== "cancelled" &&
          u.status !== "failed",
      ),
    );
  }, []);

  // react-dropzone for the main drop area
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: addToQueue,
    noClick: true,
    noKeyboard: true,
  });

  // Global drag events for full-screen overlay
  useEffect(() => {
    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) {
        setGlobalDragActive(true);
      }
    }

    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setGlobalDragActive(false);
      }
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
    }

    function handleDrop(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current = 0;
      setGlobalDragActive(false);
    }

    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragenter", handleDragEnter);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);
    };
  }, []);

  const hasActiveUploads = uploads.length > 0;
  const finishedCount = uploads.filter(
    (u) =>
      u.status === "complete" || u.status === "cancelled" || u.status === "failed",
  ).length;

  return (
    <div {...getRootProps()} className="relative">
      <input {...getInputProps()} />

      {children}

      {/* Full-screen drop overlay */}
      {globalDragActive && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-blue-600/20 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-blue-600 bg-white p-12 text-center shadow-lg">
            <svg
              className="mx-auto mb-4 h-12 w-12 text-blue-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-lg font-semibold text-blue-600">
              Drop files to upload
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Files will be uploaded to the current folder
            </p>
          </div>
        </div>
      )}

      {/* Upload queue panel */}
      {hasActiveUploads && (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Uploads ({uploads.length})
            </h3>
            {finishedCount > 0 && (
              <button
                type="button"
                onClick={clearFinished}
                className="text-xs text-blue-600 transition-colors duration-150 hover:text-blue-800 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Clear finished
              </button>
            )}
          </div>

          {/* Upload entries */}
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {uploads.map((entry) => (
              <UploadEntryRow
                key={entry.id}
                entry={entry}
                onCancel={() => cancelUpload(entry.id)}
                onRetry={() => retryUpload(entry.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Single upload entry in the queue panel. */
function UploadEntryRow({
  entry,
  onCancel,
  onRetry,
}: {
  entry: UploadEntry;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const statusColor =
    entry.status === "complete"
      ? "text-green-600"
      : entry.status === "failed"
        ? "text-red-600"
        : entry.status === "cancelled"
          ? "text-gray-400"
          : "text-gray-500";

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="max-w-[180px] truncate text-sm font-medium text-gray-900">
          {entry.file.name}
        </span>
        <span className={`text-xs ${statusColor}`}>
          {entry.status === "uploading" && `${entry.progress}%`}
          {entry.status === "pending" && "Queued"}
          {entry.status === "complete" && "Done"}
          {entry.status === "failed" && (entry.error ?? "Failed")}
          {entry.status === "cancelled" && "Cancelled"}
        </span>
      </div>

      {/* Progress bar */}
      {(entry.status === "uploading" || entry.status === "pending") && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${entry.progress}%` }}
          />
        </div>
      )}

      {/* Actions */}
      <div className="mt-2 flex gap-2">
        {entry.status === "uploading" && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-xs text-red-600 transition-colors duration-150 hover:bg-red-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        )}
        {entry.status === "failed" && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md px-2 py-1 text-xs text-blue-600 transition-colors duration-150 hover:bg-blue-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
