/**
 * Main file browser container.
 *
 * Fetches folder contents via React Query, manages view mode (grid/list)
 * persisted to localStorage, handles drag-and-drop upload, and renders
 * loading skeleton, empty state, error state with retry, and all child
 * components (grid, list, upload zone, context menu, preview, share dialog).
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useFolderContents } from "@/hooks/useFiles";
import { useDeleteFile } from "@/hooks/useFiles";
import { useDeleteFolder } from "@/hooks/useFolders";
import { FileGrid } from "./file-grid";
import { FileList } from "./file-list";
import { UploadZone } from "./upload-zone";
import { Breadcrumb } from "./breadcrumb";
import {
  ContextMenu,
  fileActions,
  folderActions,
  multiSelectActions,
  type ContextMenuAction,
} from "./context-menu";
import { FilePreview } from "./file-preview";
import { ShareDialog } from "./share-dialog";
import type { BreadcrumbItem, ContentItem, FileItem } from "@/types";

interface FileBrowserProps {
  /** Current folder ID (null = root). */
  folderId: string | null;
  /** Breadcrumb path segments. */
  breadcrumbs: BreadcrumbItem[];
}

type ViewMode = "grid" | "list";

/** Read view mode from localStorage with fallback. */
function getViewMode(): ViewMode {
  if (typeof window === "undefined") return "grid";
  const stored = localStorage.getItem("cloudvault-view-mode");
  return stored === "list" ? "list" : "grid";
}

/** Persist view mode to localStorage. */
function setViewMode(mode: ViewMode) {
  try {
    localStorage.setItem("cloudvault-view-mode", mode);
  } catch {
    // Ignore storage errors
  }
}

/** Loading skeleton for grid view. */
function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse flex-col items-center rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="mb-3 h-16 w-16 rounded-md bg-gray-200" />
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="mt-2 h-3 w-16 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

/** Loading skeleton for list view. */
function ListSkeleton() {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="h-4 w-4 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-5 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
          <div className="ml-auto h-4 w-16 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

export function FileBrowser({ folderId, breadcrumbs }: FileBrowserProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [viewMode, setViewModeState] = useState<ViewMode>("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: ContentItem | null;
    actions: ContextMenuAction[];
  } | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [shareTarget, setShareTarget] = useState<{
    type: "file" | "folder";
    id: string;
    name: string;
  } | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Persisted view mode
  useEffect(() => {
    setViewModeState(getViewMode());
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewModeState((prev) => {
      const next = prev === "grid" ? "list" : "grid";
      setViewMode(next);
      return next;
    });
  }, []);

  // Fetch folder contents
  const {
    data: items = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useFolderContents(folderId);

  const deleteFileMutation = useDeleteFile();
  const deleteFolderMutation = useDeleteFolder();

  /** Toggle selection of an item. */
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /** Clear selection. */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  /** Open an item (navigate to folder or preview file). */
  const openItem = useCallback(
    (item: ContentItem) => {
      if (item.type === "folder") {
        router.push(`/dashboard/${item.id}`);
      } else {
        setPreviewFile(item);
      }
    },
    [router],
  );

  /** Download a file. */
  const downloadFile = useCallback((fileId: string, fileName: string) => {
    const a = document.createElement("a");
    a.href = `/api/v1/files/${fileId}/download`;
    a.download = fileName;
    a.click();
  }, []);

  /** Copy a share link to clipboard. */
  const copyShareLink = useCallback(
    async (resourceType: string, resourceId: string) => {
      try {
        const links = await fetch(
          `/api/v1/${resourceType}s/${resourceId}/share-links`,
        ).then((r) => r.json());
        const active = links.find((l: { isActive: boolean }) => l.isActive);
        if (active) {
          const url = `${window.location.origin}/s/${active.token}`;
          await navigator.clipboard.writeText(url);
          setToast({ message: "Link copied to clipboard", type: "success" });
        } else {
          setToast({
            message: "No active share link. Create one first.",
            type: "error",
          });
        }
      } catch {
        setToast({ message: "Failed to copy link", type: "error" });
      }
    },
    [],
  );

  /** Trash selected items. */
  const trashSelected = useCallback(() => {
    for (const id of selectedIds) {
      const item = items.find((i) => i.id === id);
      if (item?.type === "file") {
        deleteFileMutation.mutate(id);
      } else if (item?.type === "folder") {
        deleteFolderMutation.mutate(id);
      }
    }
    clearSelection();
    setToast({
      message: `${selectedIds.size} item(s) moved to trash`,
      type: "success",
    });
  }, [
    selectedIds,
    items,
    deleteFileMutation,
    deleteFolderMutation,
    clearSelection,
  ]);

  /** Show context menu for an item. */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, item: ContentItem) => {
      e.preventDefault();
      e.stopPropagation();

      // If the item is not selected, select only it
      if (!selectedIds.has(item.id)) {
        setSelectedIds(new Set([item.id]));
      }

      const isMultiSelect = selectedIds.size > 1 && selectedIds.has(item.id);

      let actions: ContextMenuAction[];
      if (isMultiSelect) {
        actions = multiSelectActions({
          onDownloadZip: () => {
            setToast({
              message: "Download as zip — coming soon",
              type: "success",
            });
          },
          onMoveTo: () => {
            setToast({ message: "Move to — coming soon", type: "success" });
          },
          onTrash: trashSelected,
        });
      } else if (item.type === "folder") {
        actions = folderActions({
          onOpen: () => openItem(item),
          onShare: () =>
            setShareTarget({
              type: "folder",
              id: item.id,
              name: item.name,
            }),
          onRename: () => {
            setToast({ message: "Rename — coming soon", type: "success" });
          },
          onMoveTo: () => {
            setToast({ message: "Move to — coming soon", type: "success" });
          },
          onCopyLink: () => copyShareLink("folder", item.id),
          onDetails: () => {
            setToast({ message: "Details — coming soon", type: "success" });
          },
          onTrash: () => {
            deleteFolderMutation.mutate(item.id);
            setToast({
              message: `"${item.name}" moved to trash`,
              type: "success",
            });
          },
        });
      } else {
        const file = item as FileItem;
        actions = fileActions({
          onDownload: () => downloadFile(file.id, file.name),
          onPreview: () => setPreviewFile(file),
          onShare: () =>
            setShareTarget({
              type: "file",
              id: file.id,
              name: file.name,
            }),
          onRename: () => {
            setToast({ message: "Rename — coming soon", type: "success" });
          },
          onMoveTo: () => {
            setToast({ message: "Move to — coming soon", type: "success" });
          },
          onCopyLink: () => copyShareLink("file", file.id),
          onDetails: () => {
            setToast({ message: "Details — coming soon", type: "success" });
          },
          onTrash: () => {
            deleteFileMutation.mutate(file.id);
            setToast({
              message: `"${file.name}" moved to trash`,
              type: "success",
            });
          },
        });
      }

      setContextMenu({ x: e.clientX, y: e.clientY, item, actions });
    },
    [
      selectedIds,
      openItem,
      downloadFile,
      copyShareLink,
      trashSelected,
      deleteFileMutation,
      deleteFolderMutation,
    ],
  );

  /** Close context menu. */
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timeout);
    }
  }, [toast]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Delete" && selectedIds.size > 0) {
        e.preventDefault();
        trashSelected();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, trashSelected]);

  return (
    <UploadZone
      folderId={folderId ?? undefined}
      onToast={(message, type) => setToast({ message, type })}
    >
      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <Breadcrumb items={breadcrumbs} />
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <button
              type="button"
              onClick={toggleViewMode}
              className="rounded-md border border-gray-300 p-2 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label={
                viewMode === "grid"
                  ? "Switch to list view"
                  : "Switch to grid view"
              }
            >
              {viewMode === "grid" ? (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              )}
            </button>

            {/* Selection actions */}
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={trashSelected}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-red-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Trash ({selectedIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Content area */}
        {isLoading ? (
          viewMode === "grid" ? (
            <GridSkeleton />
          ) : (
            <ListSkeleton />
          )
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <svg
              className="h-12 w-12 text-red-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-gray-600">
              {error instanceof Error
                ? error.message
                : "Failed to load folder contents."}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <svg
              className="h-12 w-12 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-gray-600">
              This folder is empty. Drag and drop files to upload.
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <FileGrid
            items={items}
            selectedIds={selectedIds}
            onSelect={toggleSelect}
            onOpen={openItem}
            onContextMenu={handleContextMenu}
          />
        ) : (
          <FileList
            items={items}
            selectedIds={selectedIds}
            onSelect={toggleSelect}
            onOpen={openItem}
            onContextMenu={handleContextMenu}
          />
        )}
      </div>

      {/* Context menu overlay */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.item ? [contextMenu.item] : []}
          actions={contextMenu.actions}
          onClose={closeContextMenu}
        />
      )}

      {/* File preview modal */}
      {previewFile && (
        <FilePreview
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={() => downloadFile(previewFile.id, previewFile.name)}
        />
      )}

      {/* Share dialog */}
      {shareTarget && (
        <ShareDialog
          resourceType={shareTarget.type}
          resourceId={shareTarget.id}
          resourceName={shareTarget.name}
          onClose={() => setShareTarget(null)}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </UploadZone>
  );
}
