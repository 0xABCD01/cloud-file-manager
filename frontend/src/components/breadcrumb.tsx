/**
 * Breadcrumb navigation for the file browser.
 *
 * Shows clickable segments for each ancestor folder, with the current
 * folder rendered as bold non-clickable text. Includes a home icon for
 * root navigation and truncation on narrow viewports.
 */

"use client";

import Link from "next/link";
import type { BreadcrumbItem } from "@/types";

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Navigate to root. */
  onNavigateHome?: () => void;
}

/** Home / root icon. */
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

/** Chevron separator. */
function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function Breadcrumb({ items, onNavigateHome }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {/* Home link */}
      <Link
        href="/dashboard"
        onClick={(e) => {
          if (onNavigateHome) {
            e.preventDefault();
            onNavigateHome();
          }
        }}
        className="flex items-center gap-1 rounded-md p-1 text-gray-500 transition-colors duration-150 hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Home"
      >
        <HomeIcon className="h-4 w-4" />
      </Link>

      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={item.id} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-gray-400" />
            {isLast ? (
              <span className="font-semibold text-gray-900" aria-current="page">
                {item.name}
              </span>
            ) : (
              <Link
                href={`/dashboard/${item.id}`}
                className="rounded-md p-1 text-gray-600 transition-colors duration-150 hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {/* On mobile, truncate deep paths */}
                <span className="block max-w-[80px] truncate sm:max-w-none">
                  {item.name}
                </span>
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
