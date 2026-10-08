"use client";

import { useState } from "react";
import { QRScannerModal } from "@/components/ui/QRScannerModal";

export function ScanButton() {
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsScannerOpen(true)}
        className="focus-ring inline-flex h-9 items-center justify-center gap-1.5 px-2.5 sm:px-3 rounded-xl bg-surface border border-surface-hover text-ink-300 hover:bg-surface-hover hover:text-brand-400 transition-all hover:scale-105 active:scale-95"
        title="Scan File QR Code"
        aria-label="Scan QR Code"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-brand-400 shrink-0"
        >
          {/* Viewfinder brackets */}
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          {/* Internal QR scanning dots / line */}
          <line x1="7" y1="12" x2="17" y2="12" strokeDasharray="1 1" />
          <rect x="7" y="7" width="3" height="3" fill="currentColor" />
          <rect x="14" y="7" width="3" height="3" fill="currentColor" />
          <rect x="7" y="14" width="3" height="3" fill="currentColor" />
        </svg>
        <span className="text-xs font-semibold font-heading hidden sm:inline text-ink-200">
          Scan QR
        </span>
      </button>

      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
      />
    </>
  );
}
