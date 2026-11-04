// How rows word times. Adapted from T3 Code (MIT, (c) 2026 T3 Tools Inc.,
// packages/client-runtime/src/state/models.ts and
// apps/web/src/components/sidebar/SidebarThreadRow.tsx); see
// third-party-licenses/t3code.txt.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A Working session's elapsed time: `12s`, `5m`, `1h 5m`, `1d 1h`. */
export const formatWorkingDuration = (elapsedMs: number): string => {
  const seconds = Math.max(0, Math.floor(elapsedMs / SECOND));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

/** How long ago something happened, compactly: `now`, `5m`, `3h`, `2d`. */
export const formatRelativeTime = (elapsedMs: number): string => {
  if (elapsedMs < MINUTE) {
    return "now";
  }

  if (elapsedMs < HOUR) {
    return `${Math.floor(elapsedMs / MINUTE)}m`;
  }

  if (elapsedMs < DAY) {
    return `${Math.floor(elapsedMs / HOUR)}h`;
  }

  return `${Math.floor(elapsedMs / DAY)}d`;
};
