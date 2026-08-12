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
          "focus-ring flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-6 py-16 text-center transition-colors cursor-pointer",
          isDragging ? "border-brand-500 bg-brand-50" : "border-ink-100 bg-white hover:border-brand-400",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 16V4M12 4L7 9M12 4L17 9M5 20H19"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-ink-900">
            Drag a file here, or <span className="text-brand-500">browse</span>
          </p>
          <p className="mt-1 text-xs text-ink-400">Up to 10GB · deleted automatically after expiration</p>
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
