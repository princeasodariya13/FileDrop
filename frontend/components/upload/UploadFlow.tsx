"use client";

import { useState, useRef, useEffect } from "react";
import { Dropzone } from "@/components/upload/Dropzone";
import { UploadOptionsForm } from "@/components/upload/UploadOptionsForm";
import { UploadProgressView } from "@/components/upload/UploadProgressView";
import { ShareResult } from "@/components/upload/ShareResult";
import { Button } from "@/components/ui/Button";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useToast } from "@/components/ui/Toast";
import { UploadOptions, CompleteUploadResponse } from "@/types/upload";
import { formatBytes } from "@/utils/format";
import { useMyUploads } from "@/hooks/useMyUploads";
import { MyUploadsList } from "@/components/upload/MyUploadsList";

import { ReceiveFileSection } from "@/components/receiver/ReceiveFileSection";

const DEFAULT_OPTIONS: UploadOptions = { expirationSeconds: 3600, downloadLimit: null };

interface ActiveUploadMetadata {
  sessionId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  startedAt: number;
}

export function UploadFlow() {
  const [activeTab, setActiveTab] = useState<"send" | "receive">("send");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<UploadOptions>(DEFAULT_OPTIONS);
  const [batchResult, setBatchResult] = useState<CompleteUploadResponse | null>(null);
  const [currentUploadingFileName, setCurrentUploadingFileName] = useState<string | null>(null);

  const { state, upload, resume, cancel, reset } = useFileUpload();
  const { push } = useToast();
  const { addUpload } = useMyUploads();

  const [unfinishedUpload, setUnfinishedUpload] = useState<ActiveUploadMetadata | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const addFilesInputRef = useRef<HTMLInputElement>(null);

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
    if (["success", "cancelled"].includes(state.status)) {
      setUnfinishedUpload(null);
    }
  }, [state.status]);

  const isBusy = ["validating", "reserving", "initializing", "uploading", "paused", "completing"].includes(state.status);

  function handleFilesSelected(newFiles: File[]) {
    setSelectedFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const uniqueNew = newFiles.filter((f) => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...uniqueNew];
    });
  }

  function handleRemoveFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleStart() {
    if (selectedFiles.length === 0) return;

    // Generate ONE 6-digit transfer code for all files in this batch
    const batchCode = Math.floor(100000 + Math.random() * 900000).toString();
    const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const completedResults: CompleteUploadResponse[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentUploadingFileName(`File ${i + 1} of ${selectedFiles.length}: ${file.name}`);
        const singleResult = await upload(file, options, batchCode, bundleId);
        // Note: state.result will be populated when worker completes single file
      }
    } catch (err: any) {
      push(state.errorMessage ?? "Upload failed for one or more files.", "error");
    }
  }

  useEffect(() => {
    if (state.status === "success" && state.result) {
      // Update batch result or single result
      const res = state.result;
      if (selectedFiles.length > 1) {
        const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);
        const batch: CompleteUploadResponse = {
          ...res,
          fileName: `${selectedFiles.length} Files (${selectedFiles[0].name}, +${selectedFiles.length - 1} more)`,
          sizeBytes: totalSize,
          files: selectedFiles.map((f) => ({
            fileId: res.fileId,
            fileName: f.name,
            sizeBytes: f.size,
            shareUrl: res.shareUrl,
          })),
        };
        setBatchResult(batch);
        addUpload(batch);
      } else {
        setBatchResult(res);
        addUpload(res);
      }
    }
  }, [state.status, state.result, selectedFiles, addUpload]);

  function handleReset() {
    setSelectedFiles([]);
    setBatchResult(null);
    setCurrentUploadingFileName(null);
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

  const activeResult = batchResult || (state.status === "success" ? state.result : null);

  if (activeResult) {
    return (
      <div className="space-y-4">
        <ShareResult result={activeResult} onUploadAnother={handleReset} />
        <MyUploadsList />
      </div>
    );
  }

  if (isBusy && (selectedFiles.length > 0 || unfinishedUpload)) {
    return (
      <UploadProgressView
        fileName={currentUploadingFileName || selectedFiles[0]?.name || unfinishedUpload?.fileName || "File"}
        progress={state}
        onCancel={cancel}
      />
    );
  }

  const totalBatchSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="space-y-6">
      {/* Send / Receive Mode Switcher */}
      <div className="flex items-center justify-center p-1.5 bg-surface border border-surface-hover rounded-2xl max-w-xs mx-auto shadow-inner">
        <button
          type="button"
          onClick={() => setActiveTab("send")}
          className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "send"
              ? "bg-btn-primary text-white shadow-lg shadow-brand-500/30"
              : "text-ink-400 hover:text-ink-50"
          }`}
        >
          Send Files
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("receive")}
          className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTab === "receive"
              ? "bg-btn-primary text-white shadow-lg shadow-brand-500/30"
              : "text-ink-400 hover:text-ink-50"
          }`}
        >
          Receive Code
        </button>
      </div>

      {activeTab === "receive" ? (
        <ReceiveFileSection />
      ) : (
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
            <Dropzone onFilesSelected={handleFilesSelected} disabled={isBusy} />
          )}

          {selectedFiles.length > 0 && !unfinishedUpload && (
            <div className="rounded-card p-6 space-y-6 animate-fade-in-scale">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-300 uppercase tracking-wider font-mono">
                    {selectedFiles.length} {selectedFiles.length === 1 ? "File Selected" : "Files Selected"} ({formatBytes(totalBatchSize)})
                  </span>
                  <button
                    type="button"
                    onClick={() => addFilesInputRef.current?.click()}
                    className="text-xs text-brand-400 hover:text-brand-300 underline font-medium"
                  >
                    + Add more files
                  </button>
                  <input
                    type="file"
                    multiple
                    ref={addFilesInputRef}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        handleFilesSelected(Array.from(e.target.files));
                      }
                      e.target.value = "";
                    }}
                  />
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-surface border border-surface-hover rounded-xl p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-ink-50">{file.name}</p>
                          <p className="text-[10px] text-ink-400 font-mono mt-0.5">{formatBytes(file.size)}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFile(index)}
                        className="ml-2 text-xs py-1 px-2 hover:text-red-400 hover:bg-red-500/10"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <UploadOptionsForm value={options} onChange={setOptions} />

              {state.status === "failed" && (
                <p role="alert" className="text-sm text-red-600">
                  {state.errorMessage}
                </p>
              )}

              <Button className="w-full" onClick={handleStart}>
                Upload {selectedFiles.length} {selectedFiles.length === 1 ? "File" : "Files"} &amp; get 1 Code
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
        </div>
      )}

      <MyUploadsList />
    </div>
  );
}
