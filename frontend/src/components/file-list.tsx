/**
 * List (table) view for the file browser.
 *
 * Renders files and folders in a table with sortable column headers,
 * keyboard navigation (arrow keys, Enter to open, Space to select),
 * row hover state, and context-menu integration.
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { ContentItem, FileItem } from "@/types";

interface FileListProps {
  items: ContentItem[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onOpen: (item: ContentItem) => void;
  onContextMenu: (e: React.MouseEvent, item: ContentItem) => void;
}

type SortKey = "name" | "sizeBytes" | "updatedAt" | "mimeType";
type SortDir = "asc" | "desc";

/** Format bytes to human-readable string. */
function formatSize(bytes: number): string {
  if (bytes === 0) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Sortable column header. */
function SortHeader({
  label,
  sortKey,
  currentSort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentSort.key === sortKey;
  return (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 transition-colors duration-150 hover:text-gray-700"
      onClick={() => onSort(sortKey)}
      aria-sort={
        isActive
          ? currentSort.dir === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span aria-hidden="true">
            {currentSort.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </span>
    </th>
  );
}

function getRowSize(item: ContentItem): number {
  return item.type === "file" ? item.sizeBytes : 0;
}

function getRowMime(item: ContentItem): string {
  return item.type === "file" ? item.mimeType : "folder";
}

function getRowUpdated(item: ContentItem): string {
  return item.updatedAt;
}

export function FileList({
  items,
  selectedIds,
  onSelect,
  onOpen,
  onContextMenu,
}: FileListProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "name",
    dir: "asc",
  });
  const [focusIndex, setFocusIndex] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);

  /** Toggle sort direction or change sort column. */
  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc",
    }));
  }, []);

  /** Sorted items: folders first, then by sort column. */
  const sortedItems = [...items].sort((a, b) => {
    // Folders always first
    if (a.type === "folder" && b.type !== "folder") return -1;
    if (a.type !== "folder" && b.type === "folder") return 1;

    let cmp = 0;
    switch (sort.key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "sizeBytes":
        cmp = getRowSize(a) - getRowSize(b);
        break;
      case "updatedAt":
        cmp =
          new Date(getRowUpdated(a)).getTime() -
          new Date(getRowUpdated(b)).getTime();
        break;
      case "mimeType":
        cmp = getRowMime(a).localeCompare(getRowMime(b));
        break;
    }

    return sort.dir === "asc" ? cmp : -cmp;
  });

  /** Keyboard handler for the table body. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusIndex((prev) => Math.min(prev + 1, sortedItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (sortedItems[focusIndex]) {
            onOpen(sortedItems[focusIndex]);
          }
          break;
        case " ":
          e.preventDefault();
          if (sortedItems[focusIndex]) {
            onSelect(sortedItems[focusIndex].id);
          }
          break;
      }
    },
    [sortedItems, focusIndex, onOpen, onSelect],
  );

  return (
    <div className="overflow-x-auto">
      <table
        ref={tableRef}
        className="w-full text-left text-sm"
        role="grid"
        aria-label="File list"
        aria-multiselectable
        onKeyDown={handleKeyDown}
      >
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="w-10 px-3 py-2">
              <input
                type="checkbox"
                checked={
                  sortedItems.length > 0 &&
                  sortedItems.every((i) => selectedIds.has(i.id))
                }
                onChange={() => {
                  for (const item of sortedItems) {
                    if (!selectedIds.has(item.id)) {
                      onSelect(item.id);
                    }
                  }
                }}
                aria-label="Select all"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              />
            </th>
            <th className="w-10 px-3 py-2" />
            <SortHeader
              label="Name"
              sortKey="name"
              currentSort={sort}
              onSort={handleSort}
            />
            <SortHeader
              label="Size"
              sortKey="sizeBytes"
              currentSort={sort}
              onSort={handleSort}
            />
            <SortHeader
              label="Modified"
              sortKey="updatedAt"
              currentSort={sort}
              onSort={handleSort}
            />
            <th className="w-20 px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item, index) => {
            const isFocused = index === focusIndex;
            const isSelected = selectedIds.has(item.id);
            const isFolder = item.type === "folder";

            return (
              <tr
                key={item.id}
                className={`border-b transition-colors duration-150 ${
                  isFocused ? "bg-blue-50" : "hover:bg-gray-50"
                } ${isSelected ? "bg-blue-50/50" : ""}`}
                role="row"
                aria-selected={isSelected}
                onClick={(e) => {
                  setFocusIndex(index);
                  if (e.ctrlKey || e.metaKey) {
                    onSelect(item.id);
                  }
                }}
                onDoubleClick={() => onOpen(item)}
                onContextMenu={(e) => onContextMenu(e, item)}
                tabIndex={isFocused ? 0 : -1}
              >
                {/* Checkbox */}
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${item.name}`}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  />
                </td>

                {/* Icon */}
                <td className="px-3 py-2">
                  {isFolder ? (
                    <svg
                      className="h-5 w-5 text-blue-600"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
                    </svg>
                  ) : (
                    <span className="text-lg" aria-hidden="true">
                      {getFileEmoji((item as FileItem).mimeType)}
                    </span>
                  )}
                </td>

                {/* Name */}
                <td className="max-w-[300px] truncate px-3 py-2 font-medium text-gray-900">
                  {item.name}
                </td>

                {/* Size */}
                <td className="px-3 py-2 text-gray-500">
                  {isFolder ? "--" : formatSize((item as FileItem).sizeBytes)}
                </td>

                {/* Modified */}
                <td className="px-3 py-2 text-gray-500">
                  {formatDistanceToNow(new Date(item.updatedAt), {
                    addSuffix: true,
                  })}
                </td>

                {/* Actions placeholder */}
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="rounded-md p-1 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      onContextMenu(e, item);
                    }}
                    aria-label={`Actions for ${item.name}`}
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getFileEmoji(mimeType: string): string {
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
