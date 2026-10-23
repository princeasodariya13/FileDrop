"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { formatBytes } from "@/utils/format";

const MAX_FILE_SIZE_BYTES = 10 * 1024 ** 3; // 10GB — mirrors backend MAX_FILE_SIZE default

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function Dropzone({ onFilesSelected, disabled }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback(
    (fileList: FileList | File[]) => {
      setError(null);
      const filesArray = Array.from(fileList);
      if (filesArray.length === 0) return;

      const validFiles: File[] = [];
      for (const file of filesArray) {
        if (file.size === 0) {
          setError(`File "${file.name}" is empty.`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setError(`File "${file.name}" is too large. Maximum size is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
          continue;
        }
        validFiles.push(file);
      }

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    },
    [onFilesSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      if (e.dataTransfer.files?.length) {
        validateAndSelect(e.dataTransfer.files);
      }
    },
    [disabled, validateAndSelect]
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Upload and share files: drag and drop, or press Enter to browse"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={clsx(
          "focus-ring relative overflow-hidden flex flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-16 sm:py-20 text-center cursor-pointer group",
          "transition-all duration-300 ease-out",
          isDragging 
            ? "border-brand-500 bg-brand-500/10 shadow-[0_0_30px_rgba(241,71,12,0.15)] scale-[1.01]" 
            : "border-surface-hover bg-bg-panel/70 hover:border-brand-500/60 hover:bg-surface/50 backdrop-blur-xl",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-brand-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        
        <div className={clsx(
          "relative flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300",
          isDragging ? "bg-brand-500 text-white scale-110 shadow-lg shadow-brand-500/30" : "bg-brand-500/10 text-brand-500 group-hover:bg-brand-500 group-hover:text-white group-hover:scale-105"
        )}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={clsx("transition-transform duration-300", isDragging ? "-translate-y-1" : "")}>
            <path
              d="M12 16V4M12 4L7 9M12 4L17 9M5 20H19"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="relative z-10 space-y-1.5">
          <p className="text-base sm:text-lg font-bold text-ink-50 font-heading">
            Drop &amp; share files, or <span className="text-brand-500 underline underline-offset-4 decoration-brand-500/40 group-hover:decoration-brand-500 transition-colors">browse files</span>
          </p>
          <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
            <span className="rounded-full border border-surface-hover bg-surface/60 px-2.5 py-0.5 text-[11px] text-ink-400 font-mono">
              Up to 10GB per file
            </span>
            <span className="rounded-full border border-surface-hover bg-surface/60 px-2.5 py-0.5 text-[11px] text-ink-400 font-mono">
              Free &amp; Lossless
            </span>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) {
              validateAndSelect(e.target.files);
            }
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
