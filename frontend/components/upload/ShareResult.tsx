"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatBytes, formatRelativeExpiry } from "@/utils/format";
import { CompleteUploadResponse } from "@/types/upload";
import { useToast } from "@/components/ui/Toast";

interface Props {
  result: CompleteUploadResponse;
  onUploadAnother: () => void;
}

export function ShareResult({ result, onUploadAnother }: Props) {
  const [copied, setCopied] = useState(false);
  const { push } = useToast();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result.shareUrl);
      setCopied(true);
      push("Link copied to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      push("Couldn't copy automatically — please copy the link manually.", "error");
    }
  }

  return (
    <Card className="p-6 relative overflow-hidden group border border-emerald-500/30 shadow-[0_0_40px_rgba(16,185,129,0.15)] animate-fade-in-scale">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent pointer-events-none" />
      
      <div className="relative z-10 flex items-center gap-3 text-emerald-400 bg-emerald-500/10 w-fit px-4 py-2 rounded-full border border-emerald-500/20">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-pulse">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-sm font-bold tracking-wide uppercase">Upload complete</span>
      </div>

      <div className="relative z-10 mt-6 bg-surface border border-surface-hover rounded-xl p-4">
        <p className="truncate text-sm font-medium text-ink-50">{result.fileName}</p>
        <p className="mt-1 text-xs text-ink-400 font-mono">
          {formatBytes(result.sizeBytes)} <span className="text-ink-600 mx-1">•</span> expires {formatRelativeExpiry(result.expiresAt)}
          {result.downloadLimit ? <><span className="text-ink-600 mx-1">•</span> limit {result.downloadLimit} download{result.downloadLimit > 1 ? "s" : ""}</> : ""}
        </p>
      </div>

      <div className="relative z-10 mt-4 flex items-center gap-3">
        <input
          readOnly
          value={result.shareUrl}
          aria-label="Share link"
          onFocus={(e) => e.currentTarget.select()}
          className="focus-ring flex-1 truncate rounded-xl border border-surface-hover bg-surface px-4 py-2.5 text-sm text-brand-500 font-medium font-mono"
        />
        <Button onClick={handleCopy} size="sm" className={copied ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]" : ""}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="relative z-10 mt-6 pt-6 border-t border-surface-hover">
        <Button variant="ghost" size="sm" onClick={onUploadAnother} className="w-full">
          Upload another file
        </Button>
      </div>
    </Card>
  );
}
