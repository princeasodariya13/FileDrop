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
    <Card className="p-6 relative overflow-hidden group border border-brand-500/30 shadow-[0_0_40px_rgba(99,102,241,0.15)] animate-fade-in-scale">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-transparent pointer-events-none" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-white/10 animate-pulse">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-50">{fileName}</p>
            <p className="mt-0.5 text-xs text-brand-400 font-semibold uppercase tracking-wider">{STATUS_LABEL[progress.status] ?? progress.status}</p>
          </div>
        </div>
        {canCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} className="hover:text-red-400 hover:bg-red-500/10">
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
        className="relative mt-6 h-2 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="absolute inset-y-0 left-0 h-full rounded-full bg-btn-primary transition-[width] duration-300 ease-out shadow-[0_0_10px_rgba(168,85,247,0.5)]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-ink-300 font-mono">
        <span>
          {formatBytes(progress.bytesUploaded)} / {formatBytes(progress.totalBytes)} <span className="text-brand-400 ml-1">({pct}%)</span>
        </span>
        {progress.status === "uploading" && (
          <span className="text-accent-400">
            {formatSpeed(progress.speedBytesPerSec)} · {formatEta(progress.etaSeconds)}
          </span>
        )}
      </div>
    </Card>
  );
}
