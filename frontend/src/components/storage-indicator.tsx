/**
 * Storage usage indicator with color-coded progress bar.
 *
 * - Green below 70% usage
 * - Yellow between 70-90%
 * - Red above 90%
 */

"use client";

interface StorageIndicatorProps {
  usedBytes: number;
  quotaBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function getBarColor(pct: number): string {
  if (pct > 90) return "bg-red-500";
  if (pct > 70) return "bg-yellow-500";
  return "bg-green-500";
}

function getTrackColor(pct: number): string {
  if (pct > 90) return "bg-red-100";
  if (pct > 70) return "bg-yellow-100";
  return "bg-green-100";
}

export function StorageIndicator({
  usedBytes,
  quotaBytes,
}: StorageIndicatorProps) {
  const pct = quotaBytes > 0 ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0;

  return (
    <div className="space-y-1.5">
      <div
        className={`h-2 w-full overflow-hidden rounded-full ${getTrackColor(pct)}`}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Storage usage: ${formatBytes(usedBytes)} of ${formatBytes(quotaBytes)} used`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${getBarColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">
        {formatBytes(usedBytes)} of {formatBytes(quotaBytes)} used
      </p>
    </div>
  );
}
