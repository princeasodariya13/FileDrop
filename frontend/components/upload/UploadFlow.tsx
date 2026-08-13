"use client";

import { useState } from "react";
import { Dropzone } from "@/components/upload/Dropzone";
import { UploadOptionsForm } from "@/components/upload/UploadOptionsForm";
import { UploadProgressView } from "@/components/upload/UploadProgressView";
import { ShareResult } from "@/components/upload/ShareResult";
import { Button } from "@/components/ui/Button";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useToast } from "@/components/ui/Toast";
import { UploadOptions } from "@/types/upload";
import { formatBytes } from "@/utils/format";

const DEFAULT_OPTIONS: UploadOptions = { expirationSeconds: 3600, downloadLimit: null };

export function UploadFlow() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [options, setOptions] = useState<UploadOptions>(DEFAULT_OPTIONS);
  const { state, upload, cancel, reset } = useFileUpload();
  const { push } = useToast();

  const isBusy = ["validating", "reserving", "initializing", "uploading", "completing"].includes(state.status);

  async function handleStart() {
    if (!selectedFile) return;
    try {
      await upload(selectedFile, options);
    } catch {
      push(state.errorMessage ?? "Upload failed. Your file has not been saved.", "error");
    }
  }

  function handleReset() {
    setSelectedFile(null);
    setOptions(DEFAULT_OPTIONS);
    reset();
  }

  if (state.status === "success" && state.result) {
    return <ShareResult result={state.result} onUploadAnother={handleReset} />;
  }

  if (isBusy && selectedFile) {
    return <UploadProgressView fileName={selectedFile.name} progress={state} onCancel={cancel} />;
  }

  return (
    <div className="space-y-4">
      <Dropzone onFileSelected={setSelectedFile} disabled={isBusy} />

      {selectedFile && (
        <div className="rounded-card p-6 space-y-6 animate-fade-in-scale">
          <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-50">{selectedFile.name}</p>
                <p className="text-xs text-ink-400 font-mono mt-0.5">{formatBytes(selectedFile.size)}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)} className="ml-4 hover:text-red-400 hover:bg-red-500/10">
              Remove
            </Button>
          </div>

          <UploadOptionsForm value={options} onChange={setOptions} />

          {state.status === "failed" && (
            <p role="alert" className="text-sm text-red-600">
              {state.errorMessage}
            </p>
          )}

          <Button className="w-full" onClick={handleStart}>
            Upload &amp; get link
          </Button>
        </div>
      )}
    </div>
  );
}
