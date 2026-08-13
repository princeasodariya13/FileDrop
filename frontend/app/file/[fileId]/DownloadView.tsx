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
    <Card className="p-6 relative overflow-hidden animate-fade-in-scale border border-white/10 group shadow-[0_0_40px_rgba(0,0,0,0.5)]">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-transparent pointer-events-none" />
      
      <div className="relative z-10 flex flex-col items-center text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10 text-brand-400 group-hover:scale-110 group-hover:text-brand-300 transition-transform duration-500">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div>
          <p className="text-lg font-bold text-ink-50 font-heading tracking-tight">{file.fileName}</p>
          <p className="mt-2 text-sm text-ink-400 font-mono">
            {formatBytes(file.sizeBytes)} <span className="text-ink-600 mx-1">•</span> expires {formatRelativeExpiry(file.expiresAt)}
            {file.downloadLimit
              ? <><span className="text-ink-600 mx-1">•</span> {Math.max(0, file.downloadLimit - file.downloadCount)} left</>
              : ""}
          </p>
        </div>
      </div>

      {error && (
        <div className="relative z-10 mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <p role="alert" className="text-sm font-medium text-red-400">
            {error}
          </p>
        </div>
      )}

      <div className="relative z-10 mt-6">
        <Button className="w-full text-base py-6" onClick={handleDownload} disabled={isDownloading}>
          {isDownloading ? "Preparing download…" : "Download File"}
        </Button>
      </div>
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
          <Card className="p-8 text-center animate-fade-in-scale border-white/5 bg-black/20">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/5 mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-ink-500">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="text-base font-semibold text-ink-300">{error ?? "This file is no longer available."}</p>
          </Card>
        )}
      </ToastProvider>
    </div>
  );
}
