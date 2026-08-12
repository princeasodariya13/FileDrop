"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatBytes, formatRelativeExpiry } from "@/utils/format";
import { getDownloadUrl } from "@/lib/api/files";
import { ApiRequestError } from "@/lib/api/client";
import { FileInfoResponse } from "@/types/upload";
import { ToastProvider, useToast } from "@/components/ui/Toast";

function DownloadCard({ file }: { file: FileInfoResponse }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  async function handleDownload() {
    setIsDownloading(true);
    setError(null);
    try {
      const { downloadUrl } = await getDownloadUrl(file.fileId);
      window.location.href = downloadUrl;
      push("Your download is starting", "success");
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : "Couldn't start the download. Please try again.";
      setError(message);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Card className="p-6">
      <p className="truncate text-base font-medium text-ink-900">{file.fileName}</p>
      <p className="mt-1 text-xs text-ink-400">
        {formatBytes(file.sizeBytes)} · expires {formatRelativeExpiry(file.expiresAt)}
        {file.downloadLimit
          ? ` · ${Math.max(0, file.downloadLimit - file.downloadCount)} download${
              file.downloadLimit - file.downloadCount === 1 ? "" : "s"
            } left`
          : ""}
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <Button className="mt-4 w-full" onClick={handleDownload} disabled={isDownloading}>
        {isDownloading ? "Preparing download…" : "Download"}
      </Button>
    </Card>
  );
}

export function DownloadView({ file, error }: { file: FileInfoResponse | null; error: string | null }) {
  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-16">
      <ToastProvider>
        {file ? (
          <DownloadCard file={file} />
        ) : (
          <Card className="p-6 text-center">
            <p className="text-sm font-medium text-ink-900">{error ?? "This file is no longer available."}</p>
          </Card>
        )}
      </ToastProvider>
    </div>
  );
}
