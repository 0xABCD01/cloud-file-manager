/**
 * File preview modal.
 *
 * Supports:
 * - Images: rendered directly with zoom controls
 * - PDF: embedded in a sandboxed iframe
 * - Text/Markdown/Code: rendered as preformatted text
 * - Video/Audio: HTML5 player
 * - SVG: NEVER inlined — shown as <img> or source code only (XSS prevention)
 * - Unsupported: metadata + download button
 *
 * Closes with Escape, click-outside, or X button. Includes focus trap.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { FileItem } from "@/types";

interface FilePreviewProps {
  file: FileItem;
  onClose: () => void;
  onDownload?: () => void;
}

/** Detect broad category from MIME type. */
function getCategory(
  mime: string,
): "image" | "pdf" | "text" | "video" | "audio" | "svg" | "other" {
  if (mime === "image/svg+xml") return "svg";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("markdown")
  )
    return "text";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "other";
}

/** Format bytes. */
function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function FilePreview({ file, onClose, onDownload }: FilePreviewProps) {
  const category = getCategory(file.mimeType);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [zoom, setZoom] = useState(1);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  const fileUrl = `/api/v1/files/${file.id}/download`;

  // Fetch text content for text-based files
  useEffect(() => {
    if (category === "text") {
      setTextLoading(true);
      fetch(fileUrl)
        .then((res) => res.text())
        .then((text) => setTextContent(text))
        .catch(() => setTextContent("Failed to load file content."))
        .finally(() => setTextLoading(false));
    }
  }, [category, fileUrl]);

  // Focus trap + Escape to close
  useEffect(() => {
    closeBtnRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${file.name}`}
    >
      <div
        ref={dialogRef}
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-gray-900">
              {file.name}
            </h2>
            <p className="text-xs text-gray-500">
              {formatSize(file.sizeBytes)} &middot;{" "}
              {formatDistanceToNow(new Date(file.updatedAt), {
                addSuffix: true,
              })}
            </p>
          </div>
          <div className="ml-4 flex items-center gap-2">
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="rounded-md px-3 py-1.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Download
              </button>
            )}
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Close preview"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {category === "image" && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                  className="rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <span className="text-xs text-gray-500">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                  className="rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Reset
                </button>
              </div>
              <img
                src={fileUrl}
                alt={file.name}
                style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
                className="max-h-[70vh] object-contain"
              />
            </div>
          )}

          {category === "svg" && (
            <div className="text-center">
              <p className="mb-4 text-sm text-gray-600">
                SVG files are displayed as images for security.
              </p>
              <img
                src={fileUrl}
                alt={file.name}
                className="mx-auto max-h-[60vh]"
              />
            </div>
          )}

          {category === "pdf" && (
            <iframe
              src={`${fileUrl}#toolbar=0`}
              title={file.name}
              sandbox="allow-same-origin"
              className="h-[70vh] w-full border-0"
            />
          )}

          {category === "text" && (
            <div>
              {textLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : (
                <pre className="overflow-x-auto rounded-md bg-gray-50 p-4 font-mono text-sm leading-relaxed text-gray-800">
                  {textContent}
                </pre>
              )}
            </div>
          )}

          {category === "video" && (
            <video
              src={fileUrl}
              controls
              className="mx-auto max-h-[70vh] w-full rounded-md"
            >
              Your browser does not support video playback.
            </video>
          )}

          {category === "audio" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <svg
                className="h-16 w-16 text-gray-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              <audio src={fileUrl} controls className="w-full max-w-md">
                Your browser does not support audio playback.
              </audio>
            </div>
          )}

          {category === "other" && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <svg
                className="h-16 w-16 text-gray-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p className="text-sm text-gray-600">
                Preview is not available for this file type.
              </p>
              <p className="text-xs text-gray-400">{file.mimeType}</p>
              {onDownload && (
                <button
                  type="button"
                  onClick={onDownload}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Download file
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
