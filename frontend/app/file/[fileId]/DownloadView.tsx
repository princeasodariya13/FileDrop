"use client";

import { useState, useRef, useEffect } from "react";
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
  const [inlineToast, setInlineToast] = useState<{ message: string; tone: "success" | "error" | "info" } | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const { push } = useToast();

  const showNotification = (message: string, tone: "success" | "error" | "info" = "info") => {
    push(message, tone);
    setInlineToast({ message, tone });
  };
  
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const expiryText = formatRelativeExpiry(file.expiresAt, currentTime);

  useEffect(() => {
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  function downloadViaIframe(downloadUrl: string, sessionId: string) {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);

    if (!heartbeatRef.current) {
      heartbeatRef.current = setInterval(() => {
        import("@/lib/api/files").then(({ sendHeartbeat }) => {
          sendHeartbeat(sessionId).catch(() => {});
        });
      }, 60000);
    }

    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 60000);
  }

  async function handleDownloadSingle(fileId: string, customFileName?: string) {
    if (new Date(file.expiresAt).getTime() <= Date.now()) {
      showNotification("This file has expired and is no longer available.", "error");
      setError("This file has expired and cannot be downloaded.");
      return;
    }

    setIsDownloading(true);
    setError(null);
    try {
      const { downloadUrl, sessionId, fileName: fetchedName } = await getDownloadUrl(fileId);
      downloadViaIframe(downloadUrl, sessionId);
      const displayName = customFileName || fetchedName || file.fileName || "File";
      showNotification(`"${displayName}" downloaded successfully!`, "success");
    } catch (err: any) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err?.message || "Couldn't start the download. Please try again.";
      if (
        message.toLowerCase().includes("expire") ||
        message.toLowerCase().includes("no longer available") ||
        message.toLowerCase().includes("not found")
      ) {
        showNotification("This file has expired and is no longer available.", "error");
        setError("This file has expired and cannot be downloaded.");
      } else {
        showNotification(message, "error");
        setError(message);
      }
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleDownloadAll() {
    if (new Date(file.expiresAt).getTime() <= Date.now()) {
      showNotification("The files have expired and are no longer available.", "error");
      setError("These files have expired and cannot be downloaded.");
      return;
    }

    const fileList = file.files && file.files.length > 0 ? file.files : [file];
    setIsDownloading(true);
    setError(null);
    try {
      // 1. Fetch all presigned URLs in parallel
      const urlPromises = fileList.map((item) => getDownloadUrl(item.fileId));
      const results = await Promise.all(urlPromises);

      // 2. Trigger iframe downloads with 800ms spacing
      for (let i = 0; i < results.length; i++) {
        const { downloadUrl, sessionId } = results[i];
        downloadViaIframe(downloadUrl, sessionId);
        if (i < results.length - 1) {
          await new Promise((r) => setTimeout(r, 800));
        }
      }
      showNotification(
        fileList.length > 1
          ? `All ${fileList.length} files downloaded successfully!`
          : "File downloaded successfully!",
        "success"
      );
    } catch (err: any) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err?.message || "Couldn't start downloads. Please try again.";
      if (
        message.toLowerCase().includes("expire") ||
        message.toLowerCase().includes("no longer available") ||
        message.toLowerCase().includes("not found")
      ) {
        showNotification("The files have expired and are no longer available.", "error");
        setError("These files have expired and cannot be downloaded.");
      } else {
        showNotification(message, "error");
        setError(message);
      }
    } finally {
      setIsDownloading(false);
    }
  }

  const isExpired = expiryText === "expired";
  const isMulti = Boolean(file.files && file.files.length > 1);

  return (
    <Card className="p-6 relative overflow-hidden animate-fade-in-scale border border-surface-hover group shadow-[0_0_40px_rgba(0,0,0,0.5)]">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-transparent pointer-events-none" />
      
      {inlineToast && (
        <div
          role="alert"
          className={`relative z-10 p-3.5 mb-5 rounded-xl border flex items-center gap-2.5 text-xs sm:text-sm font-medium animate-fade-in-scale ${
            inlineToast.tone === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              : inlineToast.tone === "error"
              ? "bg-red-500/15 border-red-500/30 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
              : "bg-brand-500/15 border-brand-500/30 text-brand-300"
          }`}
        >
          {inlineToast.tone === "success" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-emerald-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : inlineToast.tone === "error" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-red-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )}
          <span className="flex-1">{inlineToast.message}</span>
          <button
            type="button"
            onClick={() => setInlineToast(null)}
            className="text-ink-400 hover:text-ink-100 text-xs px-1.5 py-0.5 rounded transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface border border-surface-hover text-brand-400 group-hover:scale-110 group-hover:text-brand-300 transition-transform duration-500">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div>
          <p className="text-lg font-bold text-ink-50 font-heading tracking-tight">
            {isMulti ? `${file.files!.length} Files Shared` : file.fileName}
          </p>
          <p className="mt-2 text-sm text-ink-400 font-mono">
            {isMulti ? formatBytes(file.files!.reduce((a, b) => a + b.sizeBytes, 0)) : formatBytes(file.sizeBytes)}{" "}
            <span className="text-ink-600 mx-1">•</span> <span className={isExpired ? "text-red-400 font-semibold" : ""}>expires {expiryText}</span>
            {file.downloadLimit
              ? <><span className="text-ink-600 mx-1">•</span> {Math.max(0, file.downloadLimit - file.downloadCount)} left</>
              : ""}
          </p>
        </div>
      </div>

      {isMulti && (
        <div className="relative z-10 mt-6 space-y-3">
          <p className="text-xs font-semibold text-ink-300 uppercase tracking-wider">Choose a file to download:</p>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {file.files!.map((item) => (
              <div key={item.fileId} className="flex items-center justify-between gap-3 p-3 bg-bg-panel/80 rounded-xl border border-surface-hover">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-ink-50 truncate font-heading">{item.fileName}</p>
                  <p className="text-[10px] text-ink-400 font-mono">{formatBytes(item.sizeBytes)}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDownloadSingle(item.fileId, item.fileName)}
                  disabled={isDownloading}
                  className="text-xs px-3 py-1.5 text-brand-400 hover:text-brand-300 hover:bg-brand-500/10 shrink-0"
                >
                  Download
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="relative z-10 mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <p role="alert" className="text-sm font-medium text-red-400">
            {error}
          </p>
        </div>
      )}

      <div className="relative z-10 mt-6">
        <Button
          className="w-full text-base py-6"
          onClick={isMulti ? handleDownloadAll : () => handleDownloadSingle(file.fileId)}
          disabled={isDownloading}
        >
          {isDownloading
            ? "Preparing download…"
            : isMulti
            ? `Download All (${file.files!.length} Files)`
            : "Download File"}
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
          <Card className="p-8 text-center animate-fade-in-scale border-surface bg-surface">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface mb-4">
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
