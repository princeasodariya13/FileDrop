"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatBytes, formatSpeed, formatEta } from "@/utils/format";
import { UploadProgressState } from "@/types/upload";

const STATUS_LABEL: Record<string, string> = {
  validating: "Validating file…",
  reserving: "Reserving storage…",
  initializing: "Preparing upload…",
  uploading: "Uploading…",
  paused: "Paused (Waiting for network)…",
  completing: "Finalizing…",
};

interface Props {
  fileName: string;
  progress: UploadProgressState;
  onCancel: () => void;
}

export function UploadProgressView({ fileName, progress, onCancel }: Props) {
  const pct = progress.totalBytes > 0 ? Math.min(100, Math.round((progress.bytesUploaded / progress.totalBytes) * 100)) : 0;
  const canCancel = progress.status === "uploading" || progress.status === "reserving" || progress.status === "initializing";

  return (
    <Card className="p-6 sm:p-8 relative overflow-hidden group border border-surface-hover bg-bg-panel/90 backdrop-blur-xl shadow-xs rounded-3xl animate-fade-in-scale">
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500 border border-brand-500/20">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-50 font-heading">{fileName}</p>
            <p className="mt-0.5 text-xs text-brand-500 font-semibold uppercase tracking-wider font-mono">{STATUS_LABEL[progress.status] ?? progress.status}</p>
          </div>
        </div>
        {canCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} className="hover:text-red-400 hover:bg-red-500/10 text-xs">
            Cancel
          </Button>
        )}
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Upload progress: ${pct}%`}
        className="relative mt-6 h-2 w-full overflow-hidden rounded-full bg-surface-hover"
      >
        <div
          className="absolute inset-y-0 left-0 h-full rounded-full bg-brand-500 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-ink-400 font-mono">
        <span>
          {formatBytes(progress.bytesUploaded)} / {formatBytes(progress.totalBytes)} <span className="text-brand-500 font-semibold ml-1">({pct}%)</span>
        </span>
        {progress.status === "uploading" && (
          <span className="text-brand-500 font-medium">
            {formatSpeed(progress.speedBytesPerSec)} · {formatEta(progress.etaSeconds)}
          </span>
        )}
      </div>
    </Card>
  );
}
