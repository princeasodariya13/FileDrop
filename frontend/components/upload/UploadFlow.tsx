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

const DEFAULT_OPTIONS: UploadOptions = { expirationHours: 24, downloadLimit: null };

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
        <div className="rounded-card border border-ink-100 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{selectedFile.name}</p>
              <p className="text-xs text-ink-400">{formatBytes(selectedFile.size)}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>
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
