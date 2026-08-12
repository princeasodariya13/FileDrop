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
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-900">{fileName}</p>
          <p className="mt-0.5 text-xs text-ink-400">{STATUS_LABEL[progress.status] ?? progress.status}</p>
        </div>
        {canCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
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
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-ink-100"
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-ink-400">
        <span>
          {formatBytes(progress.bytesUploaded)} / {formatBytes(progress.totalBytes)} ({pct}%)
        </span>
        {progress.status === "uploading" && (
          <span>
            {formatSpeed(progress.speedBytesPerSec)} · {formatEta(progress.etaSeconds)}
          </span>
        )}
      </div>
    </Card>
  );
}
