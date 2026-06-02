/**
 * Grid view for the file browser.
 *
 * Renders file and folder cards with icons based on MIME type, name, size,
 * and modified date. Supports selection state, thumbnail previews for images,
 * and right-click context menu integration.
 */

"use client";

import { formatDistanceToNow } from "date-fns";
import type { ContentItem, FileItem, FolderItem } from "@/types";

interface FileGridProps {
  items: ContentItem[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onOpen: (item: ContentItem) => void;
  onContextMenu: (e: React.MouseEvent, item: ContentItem) => void;
}

/** Format bytes to human-readable string. */
function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Return an emoji-based icon description for the MIME type. */
function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType === "application/pdf") return "📄";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "📦";
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) return "📊";
  if (mimeType.includes("presentation")) return "📽";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  if (mimeType.startsWith("text/")) return "📃";
  return "📎";
}

/** Card for a single file. */
function FileCard({
  file,
  selected,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  file: FileItem;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const isImage = file.mimeType.startsWith("image/");
  const thumbnailUrl = isImage
    ? `/api/v1/files/${file.id}/thumbnail`
    : null;

  return (
    <button
      type="button"
      className={`group relative flex flex-col items-center rounded-lg border bg-white p-4 text-left shadow-sm transition-colors duration-150 hover:border-blue-300 ${
        selected
          ? "border-blue-600 ring-2 ring-blue-500 ring-offset-2"
          : "border-gray-200"
      }`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          onSelect();
        } else {
          onOpen();
        }
      }}
      onContextMenu={onContextMenu}
      onDoubleClick={onOpen}
      aria-label={`${file.name}, ${formatSize(file.sizeBytes)}`}
      aria-selected={selected}
    >
      {/* Selection checkbox */}
      <div className="absolute left-2 top-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${file.name}`}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        />
      </div>

      {/* Icon / thumbnail */}
      <div className="mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-gray-50">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-3xl" aria-hidden="true">
            {getFileIcon(file.mimeType)}
          </span>
        )}
      </div>

      {/* Name */}
      <span className="w-full truncate text-center text-sm font-medium text-gray-900">
        {file.name}
      </span>

      {/* Meta */}
      <span className="mt-1 text-xs text-gray-500">
        {formatSize(file.sizeBytes)}
      </span>
      <span className="text-xs text-gray-400">
        {formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}
      </span>
    </button>
  );
}

/** Card for a folder. */
function FolderCard({
  folder,
  selected,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  folder: FolderItem;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`group relative flex flex-col items-center rounded-lg border bg-white p-4 text-left shadow-sm transition-colors duration-150 hover:border-blue-300 ${
        selected
          ? "border-blue-600 ring-2 ring-blue-500 ring-offset-2"
          : "border-gray-200"
      }`}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          onSelect();
        } else {
          onOpen();
        }
      }}
      onContextMenu={onContextMenu}
      onDoubleClick={onOpen}
      aria-label={`Folder: ${folder.name}`}
      aria-selected={selected}
    >
      {/* Selection checkbox */}
      <div className="absolute left-2 top-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select folder ${folder.name}`}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        />
      </div>

      {/* Folder icon */}
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-md bg-blue-50">
        <svg
          className="h-10 w-10 text-blue-600"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
        </svg>
      </div>

      {/* Name */}
      <span className="w-full truncate text-center text-sm font-medium text-gray-900">
        {folder.name}
      </span>

      {/* Item count */}
      <span className="mt-1 text-xs text-gray-500">
        {folder.childCount} {folder.childCount === 1 ? "item" : "items"}
      </span>

      <span className="text-xs text-gray-400">
        {formatDistanceToNow(new Date(folder.updatedAt), { addSuffix: true })}
      </span>
    </button>
  );
}

export function FileGrid({
  items,
  selectedIds,
  onSelect,
  onOpen,
  onContextMenu,
}: FileGridProps) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      role="listbox"
      aria-label="File grid"
      aria-multiselectable
    >
      {items.map((item) => (
        <div key={item.id} role="option" aria-selected={selectedIds.has(item.id)}>
          {item.type === "folder" ? (
            <FolderCard
              folder={item}
              selected={selectedIds.has(item.id)}
              onSelect={() => onSelect(item.id)}
              onOpen={() => onOpen(item)}
              onContextMenu={(e) => onContextMenu(e, item)}
            />
          ) : (
            <FileCard
              file={item}
              selected={selectedIds.has(item.id)}
              onSelect={() => onSelect(item.id)}
              onOpen={() => onOpen(item)}
              onContextMenu={(e) => onContextMenu(e, item)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
