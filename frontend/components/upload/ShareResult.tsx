"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatBytes, formatRelativeExpiry } from "@/utils/format";
import { CompleteUploadResponse } from "@/types/upload";
import { useToast } from "@/components/ui/Toast";

interface Props {
  result: CompleteUploadResponse;
  onUploadAnother: () => void;
  onDelete?: () => void;
}

function getFallbackCode(fileId: string): string {
  if (!fileId) return "123456";
  let hash = 0;
  for (let i = 0; i < fileId.length; i++) {
    hash = (hash * 31 + fileId.charCodeAt(i)) % 900000;
  }
  return (100000 + Math.abs(hash)).toString();
}

export function ShareResult({ result, onUploadAnother, onDelete }: Props) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { push } = useToast();

  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const activeCode = result.code || getFallbackCode(result.fileId);
  const codeDigits = activeCode.split("");

  useEffect(() => {
    try {
      const existing = JSON.parse(localStorage.getItem("filedrop_code_map") || "{}");
      existing[activeCode] = result.fileId;
      localStorage.setItem("filedrop_code_map", JSON.stringify(existing));
    } catch (e) {}
  }, [activeCode, result.fileId]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(result.shareUrl);
      setCopiedLink(true);
      push("Share link copied to clipboard", "success");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      push("Couldn't copy automatically — please copy the link manually.", "error");
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopiedCode(true);
      push("6-digit code copied to clipboard", "success");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      push("Couldn't copy code automatically.", "error");
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const { deleteFileEarly } = await import("@/lib/api/files");
      if (result.possessionToken) {
        await deleteFileEarly(result.fileId, result.possessionToken);
      }
      if (result.files && result.files.length > 0) {
        for (const sibling of result.files) {
          if (sibling.fileId !== result.fileId && sibling.possessionToken) {
            try {
              await deleteFileEarly(sibling.fileId, sibling.possessionToken);
            } catch {}
          }
        }
      }
      
      // Clean up localStorage code mapping
      try {
        const existingMap = JSON.parse(localStorage.getItem("filedrop_code_map") || "{}");
        if (existingMap[activeCode]) {
          delete existingMap[activeCode];
          localStorage.setItem("filedrop_code_map", JSON.stringify(existingMap));
        }
      } catch {}

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("filedrop_file_deleted", { detail: { fileId: result.fileId } }));
      }

      push("File permanently deleted", "success");
      if (onDelete) {
        onDelete();
      } else {
        onUploadAnother();
      }
    } catch (err: any) {
      push(err?.message || "Failed to delete file", "error");
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  }

  const isExpired = formatRelativeExpiry(result.expiresAt, now) === "expired";

  return (
    <Card className="p-6 sm:p-8 relative overflow-hidden group border border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.15)] animate-fade-in-scale">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-brand-500/5 to-transparent pointer-events-none" />
      
      <div className="relative z-10 flex items-center justify-between">
        <div className={`flex items-center gap-3 ${isExpired ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"} px-4 py-2 rounded-full border`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={isExpired ? "" : "animate-pulse"}>
            <path
              d="M20 6L9 17l-5-5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-xs sm:text-sm font-bold tracking-wide uppercase">
            {isExpired ? "File Expired" : "File Ready to Share"}
          </span>
        </div>
        <span className={`text-xs font-mono ${isExpired ? "text-red-400" : "text-ink-400"}`}>
          {isExpired ? "expired" : `expires ${formatRelativeExpiry(result.expiresAt, now)}`}
        </span>
      </div>

      <div className="relative z-10 mt-5 bg-surface border border-surface-hover rounded-xl p-4 space-y-3">
        {result.files && result.files.length > 1 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-brand-400 uppercase tracking-wider font-mono">
                {result.files.length} Files in Batch Transfer
              </span>
              <span className="text-xs text-ink-400 font-mono">
                Total: {formatBytes(result.sizeBytes)}
              </span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {result.files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 px-3 bg-bg-panel/80 rounded-lg border border-surface-hover">
                  <span className="font-medium text-ink-50 truncate font-heading max-w-[180px] sm:max-w-[260px]">{f.fileName}</span>
                  <span className="font-mono text-ink-400 shrink-0">{formatBytes(f.sizeBytes)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <p className="truncate text-sm font-medium text-ink-50 font-heading">{result.fileName}</p>
            <p className="mt-1 text-xs text-ink-400 font-mono">
              {formatBytes(result.sizeBytes)}
              {result.downloadLimit ? <><span className="text-ink-600 mx-1.5">•</span> limit {result.downloadLimit} download{result.downloadLimit > 1 ? "s" : ""}</> : ""}
            </p>
          </>
        )}
      </div>

      {/* 6-DIGIT TRANSFER CODE SECTION */}
      <div className="relative z-10 mt-6 bg-gradient-to-r from-brand-500/10 via-accent-500/10 to-brand-500/10 border border-brand-500/20 rounded-2xl p-5 shadow-inner">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-brand-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-300">6-Digit Transfer Code</span>
          </div>
          <span className="text-[11px] text-ink-400">Share with receiver</span>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
          {/* Digit Pills */}
          <div className="flex items-center gap-1.5 sm:gap-2 mx-auto sm:mx-0">
            {codeDigits.map((digit, idx) => (
              <div
                key={idx}
                className="flex h-11 w-9 sm:h-12 sm:w-11 items-center justify-center rounded-xl bg-bg-panel border border-brand-500/30 text-xl sm:text-2xl font-bold font-mono text-brand-300 shadow-md group-hover:border-brand-400 transition-colors"
              >
                {digit}
              </div>
            ))}
          </div>

          <Button
            onClick={handleCopyCode}
            size="sm"
            className={copiedCode ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]" : "bg-brand-500 hover:bg-brand-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)]"}
          >
            {copiedCode ? "Code Copied!" : "Copy Code"}
          </Button>
        </div>
      </div>

      {/* DIRECT SHARE LINK SECTION */}
      <div className="relative z-10 mt-5">
        <label className="block text-xs font-medium text-ink-400 mb-1.5">Or share direct file sharing link:</label>
        <div className="flex items-center gap-2.5">
          <input
            readOnly
            value={result.shareUrl}
            aria-label="File sharing link"
            onFocus={(e) => e.currentTarget.select()}
            className="focus-ring flex-1 truncate rounded-xl border border-surface-hover bg-surface px-4 py-2.5 text-xs sm:text-sm text-brand-400 font-medium font-mono"
          />
          <Button onClick={handleCopyLink} variant="ghost" size="sm" className={copiedLink ? "text-emerald-400 bg-emerald-500/10" : "hover:bg-surface-hover"}>
            {copiedLink ? "Copied" : "Copy Link"}
          </Button>
        </div>
      </div>

      {/* FOOTER ACTIONS */}
      <div className="relative z-10 mt-6 pt-6 border-t border-surface-hover">
        {showConfirmDelete ? (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl space-y-3 animate-fade-in-scale">
            <p className="text-xs sm:text-sm text-red-200">
              <strong className="text-red-400 block mb-1">Delete this upload permanently?</strong>
              This will remove the file immediately and disable all share links.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowConfirmDelete(false)} disabled={isDeleting} className="hover:bg-surface-hover text-xs">
                Cancel
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDelete} disabled={isDeleting} className="bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-medium">
                {isDeleting ? "Deleting..." : "Yes, Delete File"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirmDelete(true)}
              className="text-ink-400 hover:text-red-400 hover:bg-red-500/10 text-xs"
            >
              Delete File
            </Button>
            <Button variant="ghost" size="sm" onClick={onUploadAnother} className="text-ink-300 hover:text-ink-50 text-xs sm:text-sm">
              Upload another file
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
