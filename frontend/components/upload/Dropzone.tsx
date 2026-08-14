"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { formatBytes } from "@/utils/format";

const MAX_FILE_SIZE_BYTES = 10 * 1024 ** 3; // 10GB — mirrors backend MAX_FILE_SIZE default

interface DropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function Dropzone({ onFileSelected, disabled }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback(
    (file: File) => {
      setError(null);
      if (file.size === 0) {
        setError("This file is empty.");
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`File is too large. Maximum size is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file) validateAndSelect(file);
    },
    [disabled, validateAndSelect]
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Upload a file: drag and drop, or press Enter to browse"
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
          "focus-ring relative overflow-hidden flex flex-col items-center justify-center gap-4 rounded-card border-2 border-dashed px-6 py-20 text-center cursor-pointer group",
          "transition-all duration-300 ease-out",
          isDragging 
            ? "border-accent-400 bg-brand-500/10 shadow-[0_0_30px_rgba(99,102,241,0.2)]" 
            : "border-surface-hover bg-bg-panel hover:border-brand-500/50 hover:bg-brand-500/5",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-brand-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        
        <div className={clsx(
          "relative flex h-16 w-16 items-center justify-center rounded-2xl transition-transform duration-300",
          isDragging ? "bg-accent-500/20 text-accent-400 scale-110" : "bg-surface text-ink-300 group-hover:bg-brand-500/20 group-hover:text-brand-400 group-hover:scale-105"
        )}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={clsx("transition-transform duration-300", isDragging ? "-translate-y-1" : "")}>
            <path
              d="M12 16V4M12 4L7 9M12 4L17 9M5 20H19"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="relative z-10">
          <p className="text-lg font-medium text-ink-50 font-heading">
            Drag a file here, or <span className="text-brand-400 group-hover:text-accent-400 transition-colors">browse</span>
          </p>
          <p className="mt-2 text-sm text-ink-400">Up to 10GB · encrypted & secure</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) validateAndSelect(file);
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
