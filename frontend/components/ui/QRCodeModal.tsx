"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title: string;
  subtitle?: string;
  code?: string;
}

export function QRCodeModal({
  isOpen,
  onClose,
  url,
  title,
  subtitle,
  code,
}: QRCodeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const { push } = useToast();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !url) return;

    setIsGenerating(true);
    QRCode.toDataURL(url, {
      width: 380,
      margin: 2,
      color: {
        dark: "#0f172a", // Deep slate for high contrast scannability
        light: "#ffffff",
      },
      errorCorrectionLevel: "H",
    })
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error("Failed to generate QR code", err);
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [isOpen, url]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted || typeof document === "undefined") return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      push("File link copied to clipboard", "success");
    } catch {
      push("Failed to copy link", "error");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="File QR Code Modal"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-sm rounded-3xl modal-card p-6 sm:p-7 shadow-2xl animate-fade-in-scale space-y-5 text-center z-[100000]"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-8 w-8 rounded-full modal-cancel-btn flex items-center justify-center transition-colors"
          aria-label="Close QR modal"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Modal Header */}
        <div className="space-y-1 pr-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-500 text-[11px] font-semibold uppercase tracking-wider">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Scan to Download</span>
          </div>
          <h3 className="text-base font-bold modal-title truncate font-heading">{title}</h3>
          {subtitle && <p className="text-xs modal-sub font-mono">{subtitle}</p>}
        </div>

        {/* QR Code Canvas / Image Container */}
        <div className="relative mx-auto flex items-center justify-center p-4 bg-white rounded-2xl shadow-sm border border-slate-200 aspect-square max-w-[240px]">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-2 text-ink-600 animate-pulse">
              <svg className="animate-spin h-6 w-6 text-brand-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs font-mono font-medium">Generating QR...</span>
            </div>
          ) : qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code for ${title}`}
              className="w-full h-full object-contain rounded-lg"
            />
          ) : (
            <p className="text-xs text-red-500">Failed to render QR Code</p>
          )}
        </div>

        {code && (
          <div className="flex items-center justify-center gap-2 text-xs font-mono font-bold modal-title bg-surface border border-surface-hover py-2 px-3.5 rounded-xl shadow-xs">
            <span className="modal-sub">6-Digit Code:</span>
            <span className="font-extrabold tracking-widest text-sm">{code}</span>
          </div>
        )}

        <p className="text-[11px] modal-sub leading-tight">
          Point any smartphone camera at the QR code to instantly open and download this file.
        </p>

        {/* Actions */}
        <div className="pt-1">
          <Button
            size="sm"
            onClick={handleCopyLink}
            className="w-full text-xs py-2.5 bg-btn-primary text-white font-medium shadow-md shadow-brand-500/20"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5 shrink-0">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy Link
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

