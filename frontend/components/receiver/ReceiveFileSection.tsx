"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getFileInfoByCode, getDownloadUrl } from "@/lib/api/files";
import { FileInfoResponse } from "@/types/upload";
import { formatBytes, formatRelativeExpiry } from "@/utils/format";
import { useToast } from "@/components/ui/Toast";

export function ReceiveFileSection() {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [isSearching, setIsSearching] = useState(false);
  const [foundFile, setFoundFile] = useState<FileInfoResponse | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();
  const router = useRouter();

  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const fullCode = digits.join("");

  async function handleLookup(codeToLookup: string) {
    if (codeToLookup.length !== 6 || !/^\d{6}$/.test(codeToLookup)) {
      setError("Please enter a valid 6-digit number code.");
      return;
    }

    setIsSearching(true);
    setError(null);
    setFoundFile(null);

    try {
      const file = await getFileInfoByCode(codeToLookup);
      setFoundFile(file);
      push("File found successfully!", "success");
    } catch (err: any) {
      setError(err.message || "Invalid code or file has expired.");
    } finally {
      setIsSearching(false);
    }
  }

  // Auto trigger lookup when 6th digit is entered
  useEffect(() => {
    if (fullCode.length === 6 && /^\d{6}$/.test(fullCode)) {
      handleLookup(fullCode);
    }
  }, [fullCode]);

  function handleChange(index: number, value: string) {
    // Clean input to keep digits only
    const digit = value.replace(/\D/g, "").slice(-1);
    
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < 5) {
      inputRefs[index + 1].current?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);

    const nextFocusIndex = Math.min(pasted.length, 5);
    inputRefs[nextFocusIndex].current?.focus();
  }

  function handleReset() {
    setDigits(["", "", "", "", "", ""]);
    setFoundFile(null);
    setError(null);
    setTimeout(() => inputRefs[0].current?.focus(), 100);
  }

  async function handleDirectDownload() {
    if (!foundFile) return;
    setIsDownloading(true);
    try {
      const { downloadUrl } = await getDownloadUrl(foundFile.fileId);
      window.location.href = downloadUrl;
      push("Starting file download...", "success");
    } catch (err: any) {
      push(err.message || "Failed to start download.", "error");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8 relative overflow-hidden group border border-brand-500/20 shadow-[0_4px_30px_rgba(0,0,0,0.5)] animate-fade-in-scale">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-accent-500/5 to-transparent pointer-events-none" />

      <div className="relative z-10 text-center space-y-2 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold font-heading text-ink-50 tracking-tight">
          Receive a File
        </h2>
        <p className="text-xs sm:text-sm text-ink-300">
          Enter the 6-digit code provided by the sender to retrieve your file instantly.
        </p>
      </div>

      {!foundFile ? (
        <div className="relative z-10 space-y-6 max-w-sm mx-auto">
          {/* 6 Digit Input Boxes */}
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={inputRefs[index]}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                className="h-12 w-10 sm:h-14 sm:w-12 text-center text-xl sm:text-2xl font-bold font-mono bg-surface border border-surface-hover rounded-xl text-brand-300 focus:border-brand-400 focus:bg-brand-500/10 focus:ring-2 focus:ring-brand-500/40 transition-all outline-none"
              />
            ))}
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center animate-fade-in-scale">
              <p role="alert" className="text-xs sm:text-sm font-medium text-red-400">
                {error}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              className="w-full text-sm py-3"
              disabled={fullCode.length !== 6 || isSearching}
              onClick={() => handleLookup(fullCode)}
            >
              {isSearching ? "Finding File..." : "Retrieve File"}
            </Button>
          </div>
        </div>
      ) : (
        /* FOUND FILE PREVIEW & DOWNLOAD CARD */
        <div className="relative z-10 space-y-6 max-w-md mx-auto animate-fade-in-scale">
          <div className="bg-surface border border-emerald-500/30 rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Code Verified
              </span>
            </div>

            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-ink-50 truncate font-heading">{foundFile.fileName}</h3>
                <p className="mt-1 text-xs text-ink-400 font-mono">
                  {formatBytes(foundFile.sizeBytes)} <span className="text-ink-600 mx-1">•</span> expires {formatRelativeExpiry(foundFile.expiresAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="flex-1 text-sm py-3"
              disabled={isDownloading}
              onClick={handleDirectDownload}
            >
              {isDownloading ? "Starting Download..." : "Download Now"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/file/${foundFile.fileId}`)}
              className="text-xs text-ink-300 hover:text-ink-50"
            >
              Open Page
            </Button>
          </div>

          <div className="text-center pt-2">
            <button
              onClick={handleReset}
              className="text-xs text-ink-400 hover:text-brand-400 underline transition-colors"
            >
              Enter another code
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
