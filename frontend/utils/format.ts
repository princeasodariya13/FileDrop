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
