export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "—";
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${secs}s left`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m left`;
}

export function formatRelativeExpiry(iso: string, nowMs: number = Date.now()): string {
  const diffMs = new Date(iso).getTime() - nowMs;
  if (diffMs <= 0) return "expired";

  const totalSecs = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;

  if (minutes < 1) {
    return `in ${secs}s`;
  }
  if (minutes < 60) {
    return secs > 0 ? `in ${minutes}m ${secs}s` : `in ${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours < 24) {
    return remainingMins > 0 ? `in ${hours}h ${remainingMins}m` : `in ${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

export interface RoomFileExpiryInfo {
  isExpired: boolean;
  isPermanentlyDeleted: boolean;
  secondsUntilDelete: number;
  badgeText: string;
}

export function getRoomFileExpiryInfo(
  expiresAt: string | Date | null | undefined,
  nowMs: number = Date.now()
): RoomFileExpiryInfo {
  if (!expiresAt) {
    return {
      isExpired: false,
      isPermanentlyDeleted: false,
      secondsUntilDelete: 0,
      badgeText: "",
    };
  }

  const expiryTime = new Date(expiresAt).getTime();
  if (isNaN(expiryTime)) {
    return {
      isExpired: false,
      isPermanentlyDeleted: false,
      secondsUntilDelete: 0,
      badgeText: "",
    };
  }

  const diffMs = expiryTime - nowMs;

  // More than 30 seconds past expiration -> permanent deletion threshold
  if (diffMs <= -30000) {
    return {
      isExpired: true,
      isPermanentlyDeleted: true,
      secondsUntilDelete: 0,
      badgeText: "Deleted",
    };
  }

  // 0 to 30 seconds past expiration -> Expired state with countdown to permanent deletion
  if (diffMs <= 0) {
    const secondsLeft = Math.max(0, Math.ceil((expiryTime + 30000 - nowMs) / 1000));
    return {
      isExpired: true,
      isPermanentlyDeleted: false,
      secondsUntilDelete: secondsLeft,
      badgeText: `Expired • Deleting in ${secondsLeft}s`,
    };
  }

  // Active unexpired timer
  return {
    isExpired: false,
    isPermanentlyDeleted: false,
    secondsUntilDelete: 0,
    badgeText: `Expires ${formatRelativeExpiry(String(expiresAt), nowMs)}`,
  };
}

export function formatTimestamp(dateValue: string | Date | undefined): string {
  if (!dateValue) return "";
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function formatTimeAgo(dateValue: string | Date | undefined, nowMs: number = Date.now()): string {
  if (!dateValue) return "";
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return "";
    const diffMs = nowMs - d.getTime();
    if (diffMs < 0) return "just now";
    const totalSecs = Math.floor(diffMs / 1000);
    if (totalSecs < 45) return "just now";
    const minutes = Math.floor(totalSecs / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export function isRecentUpload(dateValue: string | Date | undefined, thresholdMinutes: number = 5, nowMs: number = Date.now()): boolean {
  if (!dateValue) return false;
  try {
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return false;
    const diffMs = nowMs - d.getTime();
    return diffMs >= 0 && diffMs <= thresholdMinutes * 60 * 1000;
  } catch {
    return false;
  }
}
