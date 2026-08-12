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
    <Card className="p-6">
      <div className="flex items-center gap-2 text-emerald-600">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-sm font-medium">Upload complete</span>
      </div>

      <p className="mt-3 truncate text-sm font-medium text-ink-900">{result.fileName}</p>
      <p className="text-xs text-ink-400">
        {formatBytes(result.sizeBytes)} · expires {formatRelativeExpiry(result.expiresAt)}
        {result.downloadLimit ? ` · limit ${result.downloadLimit} download${result.downloadLimit > 1 ? "s" : ""}` : ""}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <input
          readOnly
          value={result.shareUrl}
          aria-label="Share link"
          onFocus={(e) => e.currentTarget.select()}
          className="focus-ring flex-1 truncate rounded-card border border-ink-100 bg-ink-50 px-3 py-2 text-sm text-ink-900"
        />
        <Button onClick={handleCopy} size="sm">
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={onUploadAnother}>
          Upload another file
        </Button>
      </div>
    </Card>
  );
}
