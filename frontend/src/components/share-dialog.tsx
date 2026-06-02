/**
 * Share management modal for files and folders.
 *
 * Sections:
 * - "Share with people": email input, permission dropdown, share button,
 *   current permissions list with remove
 * - "Get link": toggle link sharing, permission level, expiry, optional
 *   password, copy link button, access count
 * - "Who has access" summary
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApi } from "@/lib/auth";
import type { Permission, ShareLink } from "@/types";

interface ShareDialogProps {
  resourceType: "file" | "folder";
  resourceId: string;
  resourceName: string;
  onClose: () => void;
}

/** Copy text to clipboard with fallback. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const result = document.execCommand("copy");
    document.body.removeChild(textarea);
    return result;
  }
}

export function ShareDialog({
  resourceType,
  resourceId,
  resourceName,
  onClose,
}: ShareDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(true);

  // Share form state
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Link form state
  const [linkEnabled, setLinkEnabled] = useState(false);
  const [linkPermission, setLinkPermission] = useState<"view" | "edit">("view");
  const [linkExpiry, setLinkExpiry] = useState<string>("");
  const [linkPassword, setLinkPassword] = useState("");
  const [copied, setCopied] = useState(false);

  // Fetch existing permissions and share link
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [perms, links] = await Promise.all([
          getApi().get<Permission[]>(
            `/api/v1/${resourceType}s/${resourceId}/permissions`,
          ),
          getApi().get<ShareLink[]>(
            `/api/v1/${resourceType}s/${resourceId}/share-links`,
          ),
        ]);
        setPermissions(perms);
        const activeLink = links.find((l) => l.isActive) ?? null;
        setShareLink(activeLink);
        setLinkEnabled(activeLink !== null);
        if (activeLink) {
          setLinkPermission(activeLink.permission);
          if (activeLink.expiresAt) {
            setLinkExpiry(
              new Date(activeLink.expiresAt).toISOString().slice(0, 16),
            );
          }
        }
      } catch {
        // Non-critical — just show empty state
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [resourceType, resourceId]);

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
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  /** Share with a user by email. */
  const handleShare = async () => {
    if (!email.trim()) return;
    setSharing(true);
    setShareError(null);
    try {
      const newPerm = await getApi().post<Permission>(
        `/api/v1/${resourceType}s/${resourceId}/permissions`,
        { email: email.trim(), permission },
      );
      setPermissions((prev) => [...prev, newPerm]);
      setEmail("");
    } catch (err) {
      setShareError(
        err instanceof Error ? err.message : "Failed to share",
      );
    } finally {
      setSharing(false);
    }
  };

  /** Remove a permission. */
  const handleRemovePermission = async (permId: string) => {
    try {
      await getApi().del(
        `/api/v1/permissions/${permId}`,
      );
      setPermissions((prev) => prev.filter((p) => p.id !== permId));
    } catch {
      // Silently fail — UI already updated optimistically
    }
  };

  /** Toggle link sharing on/off. */
  const handleToggleLink = async () => {
    if (linkEnabled && shareLink) {
      // Disable link
      try {
        await getApi().del(`/api/v1/share-links/${shareLink.id}`);
        setShareLink(null);
        setLinkEnabled(false);
      } catch {
        // Revert on error
        setLinkEnabled(true);
      }
    } else {
      // Create link
      try {
        const body: Record<string, unknown> = {
          resourceType,
          resourceId,
          permission: linkPermission,
        };
        if (linkExpiry) body.expiresAt = new Date(linkExpiry).toISOString();
        if (linkPassword) body.password = linkPassword;

        const newLink = await getApi().post<ShareLink>("/api/v1/share-links", body);
        setShareLink(newLink);
        setLinkEnabled(true);
      } catch {
        setLinkEnabled(false);
      }
    }
  };

  /** Copy share link to clipboard. */
  const handleCopyLink = async () => {
    if (!shareLink) return;
    const url = `${window.location.origin}/s/${shareLink.token}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${resourceName}`}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg rounded-lg bg-white shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Share &ldquo;{resourceName}&rdquo;
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            aria-label="Close"
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

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6 px-6 py-4">
            {/* Share with people */}
            <section>
              <h3 className="mb-3 text-sm font-medium text-gray-900">
                Share with people
              </h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm transition-colors duration-150 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label="Email address"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleShare();
                  }}
                />
                <select
                  value={permission}
                  onChange={(e) =>
                    setPermission(e.target.value as "view" | "edit")
                  }
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  aria-label="Permission level"
                >
                  <option value="view">Viewer</option>
                  <option value="edit">Editor</option>
                </select>
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={sharing || !email.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {sharing ? "Sharing..." : "Share"}
                </button>
              </div>
              {shareError && (
                <p className="mt-2 text-xs text-red-600" role="alert">
                  {shareError}
                </p>
              )}

              {/* Current permissions list */}
              {permissions.length > 0 && (
                <ul className="mt-3 divide-y divide-gray-100" aria-label="People with access">
                  {permissions.map((perm) => (
                    <li
                      key={perm.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {perm.userEmail}
                        </p>
                        <p className="text-xs text-gray-500">
                          {perm.permission === "edit" ? "Editor" : "Viewer"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePermission(perm.id)}
                        className="rounded-md p-1 text-gray-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        aria-label={`Remove access for ${perm.userEmail}`}
                      >
                        <svg
                          className="h-4 w-4"
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
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Get link */}
            <section className="border-t pt-4">
              <h3 className="mb-3 text-sm font-medium text-gray-900">
                Get link
              </h3>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={linkEnabled}
                    onChange={handleToggleLink}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  />
                  Enable link sharing
                </label>
              </div>

              {linkEnabled && shareLink && (
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <select
                      value={linkPermission}
                      onChange={(e) =>
                        setLinkPermission(e.target.value as "view" | "edit")
                      }
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      aria-label="Link permission"
                    >
                      <option value="view">Viewer</option>
                      <option value="edit">Editor</option>
                    </select>
                    <input
                      type="datetime-local"
                      value={linkExpiry}
                      onChange={(e) => setLinkExpiry(e.target.value)}
                      className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      aria-label="Link expiry"
                    />
                  </div>
                  <input
                    type="password"
                    value={linkPassword}
                    onChange={(e) => setLinkPassword(e.target.value)}
                    placeholder="Optional password"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    aria-label="Link password"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="flex items-center gap-2 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors duration-150 hover:bg-gray-200 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      {copied ? (
                        <>
                          <svg
                            className="h-4 w-4 text-green-600"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect
                              x="9"
                              y="9"
                              width="13"
                              height="13"
                              rx="2"
                              ry="2"
                            />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          Copy link
                        </>
                      )}
                    </button>
                    <span className="text-xs text-gray-500">
                      {shareLink.accessCount}{" "}
                      {shareLink.accessCount === 1 ? "access" : "accesses"}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* Who has access summary */}
            <section className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-900">
                Who has access
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                {permissions.length === 0 && !linkEnabled
                  ? "Only you can access this."
                  : [
                      permissions.length > 0
                        ? `${permissions.length} ${permissions.length === 1 ? "person" : "people"}`
                        : null,
                      linkEnabled ? "Anyone with the link" : null,
                    ]
                      .filter(Boolean)
                      .join(" and ")}
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
