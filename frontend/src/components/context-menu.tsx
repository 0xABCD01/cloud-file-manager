/**
 * Right-click context menu for files, folders, and multi-select.
 *
 * Renders a floating menu at the cursor position with keyboard shortcuts.
 * Supports Escape to close, click-outside to close, and arrow-key
 * navigation between items.
 */

"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { ContentItem } from "@/types";

export interface ContextMenuAction {
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContentItem[];
  actions: ContextMenuAction[];
  onClose: () => void;
}

/** Single menu item row. */
function MenuItem({
  action,
  focused,
  onHover,
}: {
  action: ContextMenuAction;
  focused: boolean;
  onHover: () => void;
}) {
  return (
    <button
      role="menuitem"
      disabled={action.disabled}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors duration-150 ${
        action.disabled
          ? "cursor-not-allowed text-gray-400"
          : action.danger
            ? "text-red-600 hover:bg-red-50"
            : focused
              ? "bg-blue-50 text-gray-900"
              : "text-gray-700 hover:bg-gray-100"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        if (!action.disabled) {
          action.onClick();
        }
      }}
      onMouseEnter={onHover}
      tabIndex={-1}
    >
      <span className="h-4 w-4 flex-shrink-0">{action.icon}</span>
      <span className="flex-1">{action.label}</span>
      {action.shortcut && (
        <span className="ml-4 text-xs text-gray-400">{action.shortcut}</span>
      )}
    </button>
  );
}

export function ContextMenu({
  x,
  y,
  items: _items,
  actions,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Clamp menu position to viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;

      if (rect.right > viewW) {
        menuRef.current.style.left = `${viewW - rect.width - 8}px`;
      }
      if (rect.bottom > viewH) {
        menuRef.current.style.top = `${viewH - rect.height - 8}px`;
      }
    }
  }, [x, y]);

  // Focus the menu on mount for keyboard nav
  useEffect(() => {
    menuRef.current?.focus();
  }, []);

  const enabledActions = actions.filter((a) => !a.disabled);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev < enabledActions.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev > 0 ? prev - 1 : enabledActions.length - 1,
          );
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          enabledActions[focusedIndex]?.onClick();
          break;
      }
    },
    [enabledActions, focusedIndex, onClose],
  );

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context menu"
      className="fixed z-50 min-w-[200px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      {actions.map((action, index) => (
        <MenuItem
          key={action.label}
          action={action}
          focused={focusedIndex === index}
          onHover={() => setFocusedIndex(index)}
        />
      ))}
    </div>
  );
}

/**
 * Build default context-menu actions for a single file.
 */
export function fileActions(handlers: {
  onDownload: () => void;
  onPreview: () => void;
  onShare: () => void;
  onRename: () => void;
  onMoveTo: () => void;
  onCopyLink: () => void;
  onDetails: () => void;
  onTrash: () => void;
}): ContextMenuAction[] {
  return [
    {
      label: "Download",
      icon: <DownloadIcon />,
      shortcut: undefined,
      onClick: handlers.onDownload,
    },
    {
      label: "Preview",
      icon: <EyeIcon />,
      onClick: handlers.onPreview,
    },
    {
      label: "Share",
      icon: <ShareIcon />,
      onClick: handlers.onShare,
    },
    {
      label: "Rename",
      icon: <PencilIcon />,
      shortcut: "F2",
      onClick: handlers.onRename,
    },
    {
      label: "Move to",
      icon: <FolderMoveIcon />,
      onClick: handlers.onMoveTo,
    },
    {
      label: "Copy link",
      icon: <LinkIcon />,
      shortcut: "Ctrl+C",
      onClick: handlers.onCopyLink,
    },
    {
      label: "Details",
      icon: <InfoIcon />,
      onClick: handlers.onDetails,
    },
    {
      label: "Trash",
      icon: <TrashIcon />,
      shortcut: "Del",
      danger: true,
      onClick: handlers.onTrash,
    },
  ];
}

/**
 * Build default context-menu actions for a single folder.
 */
export function folderActions(handlers: {
  onOpen: () => void;
  onShare: () => void;
  onRename: () => void;
  onMoveTo: () => void;
  onCopyLink: () => void;
  onDetails: () => void;
  onTrash: () => void;
}): ContextMenuAction[] {
  return [
    {
      label: "Open",
      icon: <FolderOpenIcon />,
      onClick: handlers.onOpen,
    },
    {
      label: "Share",
      icon: <ShareIcon />,
      onClick: handlers.onShare,
    },
    {
      label: "Rename",
      icon: <PencilIcon />,
      shortcut: "F2",
      onClick: handlers.onRename,
    },
    {
      label: "Move to",
      icon: <FolderMoveIcon />,
      onClick: handlers.onMoveTo,
    },
    {
      label: "Copy link",
      icon: <LinkIcon />,
      shortcut: "Ctrl+C",
      onClick: handlers.onCopyLink,
    },
    {
      label: "Details",
      icon: <InfoIcon />,
      onClick: handlers.onDetails,
    },
    {
      label: "Trash",
      icon: <TrashIcon />,
      shortcut: "Del",
      danger: true,
      onClick: handlers.onTrash,
    },
  ];
}

/**
 * Build context-menu actions for multi-select.
 */
export function multiSelectActions(handlers: {
  onDownloadZip: () => void;
  onMoveTo: () => void;
  onTrash: () => void;
}): ContextMenuAction[] {
  return [
    {
      label: "Download (zip)",
      icon: <DownloadIcon />,
      onClick: handlers.onDownloadZip,
    },
    {
      label: "Move to",
      icon: <FolderMoveIcon />,
      onClick: handlers.onMoveTo,
    },
    {
      label: "Trash",
      icon: <TrashIcon />,
      shortcut: "Del",
      danger: true,
      onClick: handlers.onTrash,
    },
  ];
}

/* ---- Inline SVG icons (16x16) ---- */

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function FolderMoveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <polyline points="9 14 12 11 15 14" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
