"use client";

import { useState, useRef, useEffect } from "react";
import { Dropzone } from "@/components/upload/Dropzone";
import { UploadOptionsForm } from "@/components/upload/UploadOptionsForm";
import { UploadProgressView } from "@/components/upload/UploadProgressView";
import { ShareResult } from "@/components/upload/ShareResult";
import { Button } from "@/components/ui/Button";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useToast } from "@/components/ui/Toast";
import { UploadOptions } from "@/types/upload";
import { formatBytes } from "@/utils/format";
import { useMyUploads } from "@/hooks/useMyUploads";
import { MyUploadsList } from "@/components/upload/MyUploadsList";

const DEFAULT_OPTIONS: UploadOptions = { expirationSeconds: 3600, downloadLimit: null };

interface ActiveUploadMetadata {
  sessionId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  startedAt: number;
}

export function UploadFlow() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [options, setOptions] = useState<UploadOptions>(DEFAULT_OPTIONS);
  const { state, upload, resume, cancel, reset } = useFileUpload();
  const { push } = useToast();
  const { addUpload } = useMyUploads();

  const [unfinishedUpload, setUnfinishedUpload] = useState<ActiveUploadMetadata | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("filedrop_active_upload");
      if (stored) {
        setUnfinishedUpload(JSON.parse(stored));
      } else {
        setUnfinishedUpload(null);
      }
    } catch (e) {}
  }, [state.status]);

  useEffect(() => {
    if (state.status === "success" && state.result) {
      addUpload(state.result);
    }
    if (["success", "cancelled"].includes(state.status)) {
      setUnfinishedUpload(null);
    }
  }, [state.status, state.result, addUpload]);

  const isBusy = ["validating", "reserving", "initializing", "uploading", "paused", "completing"].includes(state.status);

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

  async function handleResumeFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !unfinishedUpload) return;

    if (file.name !== unfinishedUpload.fileName || file.size !== unfinishedUpload.sizeBytes) {
      push("The selected file does not match the unfinished upload.", "error");
      if (resumeInputRef.current) resumeInputRef.current.value = "";
      return;
    }

    try {
      await resume(file, unfinishedUpload.sessionId);
    } catch (err: any) {
      push(err.message || "Failed to resume upload.", "error");
    }
  }

  async function handleDiscardUnfinished() {
    if (unfinishedUpload) {
      try {
        await fetch("/api/uploads/abort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: unfinishedUpload.sessionId })
        });
      } catch (e) {}
      try {
        localStorage.removeItem("filedrop_active_upload");
        localStorage.removeItem("filedrop_resume_lock");
      } catch(e) {}
      setUnfinishedUpload(null);
    }
  }

  if (state.status === "success" && state.result) {
    return (
      <div className="space-y-4">
        <ShareResult result={state.result} onUploadAnother={handleReset} />
        <MyUploadsList />
      </div>
    );
  }

  if (isBusy && (selectedFile || unfinishedUpload)) {
    return <UploadProgressView fileName={selectedFile?.name || unfinishedUpload?.fileName || "File"} progress={state} onCancel={cancel} />;
  }

  return (
    <div className="space-y-4">
      {unfinishedUpload ? (
        <div className="rounded-card p-6 space-y-4 border border-brand-500/20 bg-brand-500/5 animate-fade-in-scale">
          <h3 className="text-lg font-semibold text-brand-400">Unfinished upload detected</h3>
          <p className="text-sm text-ink-300">
            {unfinishedUpload.fileName} — {formatBytes(unfinishedUpload.sizeBytes)}
          </p>
          <p className="text-sm text-ink-400">
            This upload can be resumed from where it stopped.
          </p>
          <div className="flex gap-4 pt-2">
            <Button onClick={() => resumeInputRef.current?.click()}>Resume Upload</Button>
            <Button variant="ghost" onClick={handleDiscardUnfinished}>Discard</Button>
          </div>
          <input
            type="file"
            ref={resumeInputRef}
            className="hidden"
            onChange={handleResumeFileSelected}
          />
        </div>
      ) : (
        <Dropzone onFileSelected={setSelectedFile} disabled={isBusy} />
      )}

      {selectedFile && !unfinishedUpload && (
        <div className="rounded-card p-6 space-y-6 animate-fade-in-scale">
          <div className="flex items-center justify-between bg-surface border border-surface-hover rounded-xl p-4">
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

      {state.status === "failed" && unfinishedUpload && (
        <div className="rounded-card p-6">
          <p role="alert" className="text-sm text-red-600">
            {state.errorMessage}
          </p>
        </div>
      )}

      <MyUploadsList />
    </div>
  );
}
