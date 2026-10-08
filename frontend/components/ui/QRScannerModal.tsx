"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { useToast } from "@/components/ui/Toast";

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QRScannerModal({ isOpen, onClose }: QRScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameId = useRef<number | null>(null);

  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [scannedResult, setScannedResult] = useState<string | null>(null);

  const router = useRouter();
  const { push } = useToast();

  // Play a soft positive beep using Web Audio API on successful scan
  const playBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12); // Quick chirp up
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // Audio context might be restricted before interaction
    }
  }, []);

  // Stop active camera stream and animation loop
  const stopCamera = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsTorchOn(false);
    setHasTorch(false);
  }, []);

  // Process decoded QR text and navigate to the file
  const handleDecodedQR = useCallback(
    (data: string) => {
      if (scannedResult) return; // prevent duplicate processing
      setScannedResult(data);
      playBeep();

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(100);
      }

      push("QR Code scanned successfully!", "success");

      // Give a brief moment for the visual success check before closing & redirecting
      setTimeout(() => {
        stopCamera();
        onClose();

        const trimmed = data.trim();

        // 1. Check if it's a 6-digit code
        if (/^\d{6}$/.test(trimmed)) {
          router.push(`/?code=${encodeURIComponent(trimmed)}`);
          return;
        }

        // 2. Check if it's a full URL containing /file/
        try {
          const urlObj = new URL(trimmed, window.location.origin);
          if (urlObj.pathname.startsWith("/file/")) {
            router.push(urlObj.pathname);
            return;
          }
        } catch {
          // not a valid URL format
        }

        // 3. Check if it's a relative path like /file/123
        if (trimmed.startsWith("/file/")) {
          router.push(trimmed);
          return;
        }

        // 4. Default: if it's any external valid URL, open it or try routing
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          window.location.href = trimmed;
        } else {
          // If raw fileId or arbitrary string
          router.push(`/file/${encodeURIComponent(trimmed)}`);
        }
      }, 700);
    },
    [scannedResult, playBeep, push, stopCamera, onClose, router]
  );

  // Frame scanner loop using jsQR
  const scanFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || scannedResult) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        handleDecodedQR(code.data);
        return;
      }
    }

    animationFrameId.current = requestAnimationFrame(scanFrame);
  }, [scannedResult, handleDecodedQR]);

  // Start Camera
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    setScannedResult(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setHasCamera(false);
      setCameraError("Camera access is not supported by your browser.");
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setHasCamera(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        animationFrameId.current = requestAnimationFrame(scanFrame);
      }

      // Check if torch/flashlight is supported
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.torch) {
          setHasTorch(true);
        }
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setHasCamera(false);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("Camera permission denied. Please allow camera access in your browser settings.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No camera found on this device.");
      } else {
        setCameraError("Unable to access camera. Please check camera permissions.");
      }
    }
  }, [facingMode, stopCamera, scanFrame]);

  // Toggle torch / flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !isTorchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setIsTorchOn(nextState);
      } catch (e) {
        console.error("Torch error:", e);
      }
    }
  };

  // Flip camera between front and back
  const flipCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  // Handle image upload from file picker
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (event) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          handleDecodedQR(code.data);
        } else {
          push("No QR code found in the selected image.", "error");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Initialize camera on modal open
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="FileDrop QR Scanner"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-slate-950 border border-white/10 shadow-[0_0_60px_rgba(99,102,241,0.3)] animate-fade-in-scale flex flex-col items-center">
        {/* Top Header Bar */}
        <div className="w-full flex items-center justify-between px-5 py-4 bg-slate-950/80 backdrop-blur-md border-b border-white/10 z-20">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
            </span>
            <div>
              <h3 className="text-sm font-bold text-white font-heading leading-tight">Scan FileDrop QR</h3>
              <p className="text-[11px] text-slate-400 font-mono">Camera Scanner</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Torch Toggle (if supported) */}
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-full border transition-all ${
                  isTorchOn
                    ? "bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.5)]"
                    : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                title={isTorchOn ? "Turn off Flash" : "Turn on Flash"}
                aria-label="Toggle flashlight"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </button>
            )}

            {/* Flip Camera */}
            {hasCamera && (
              <button
                type="button"
                onClick={flipCamera}
                className="p-2 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                title="Switch Camera"
                aria-label="Switch camera"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0-4.418-3.582-8-8-8s-8 3.582-8 8c0 2.21 0.895 4.21 2.343 5.657L4 18h5v-5l-1.929 1.929C5.836 13.693 5 11.95 5 10c0-3.866 3.134-7 7-7s7 3.134 7 7-3.134 7-7 7a6.97 6.97 0 0 1-4.95-2.05" />
                </svg>
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors ml-1"
              aria-label="Close scanner"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Camera Feed & Google Pay Style Viewfinder Area */}
        <div className="relative w-full aspect-square sm:aspect-[4/3] max-h-[380px] bg-black flex items-center justify-center overflow-hidden">
          {/* Live Video Stream */}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Offscreen Canvas for jsQR Frame Processing */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Google Pay / Paytm Style Viewfinder Overlay */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Viewfinder Target Box */}
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-3xl">
              {/* Corner 1: Top-Left */}
              <div
                className={`absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 rounded-tl-2xl transition-colors duration-300 ${
                  scannedResult ? "border-emerald-400" : "border-brand-400"
                }`}
              />
              {/* Corner 2: Top-Right */}
              <div
                className={`absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 rounded-tr-2xl transition-colors duration-300 ${
                  scannedResult ? "border-emerald-400" : "border-brand-400"
                }`}
              />
              {/* Corner 3: Bottom-Left */}
              <div
                className={`absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 rounded-bl-2xl transition-colors duration-300 ${
                  scannedResult ? "border-emerald-400" : "border-brand-400"
                }`}
              />
              {/* Corner 4: Bottom-Right */}
              <div
                className={`absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 rounded-br-2xl transition-colors duration-300 ${
                  scannedResult ? "border-emerald-400" : "border-brand-400"
                }`}
              />

              {/* Laser Scanning Animation Beam */}
              {!scannedResult && hasCamera && (
                <div className="absolute left-3 right-3 h-1 bg-gradient-to-r from-transparent via-brand-400 to-transparent shadow-[0_0_15px_#818cf8] rounded-full animate-scan-laser pointer-events-none" />
              )}

              {/* Scanned Success Lock Screen */}
              {scannedResult && (
                <div className="absolute inset-0 rounded-3xl bg-emerald-500/25 backdrop-blur-xs flex flex-col items-center justify-center gap-2 animate-fade-in">
                  <div className="h-14 w-14 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/50 animate-bounce">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-emerald-300 bg-slate-950/80 px-3 py-1 rounded-full border border-emerald-400/40">
                    QR Code Verified!
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Camera Error / No Camera Fallback Overlay */}
          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-4 z-10">
              <div className="h-12 w-12 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">Camera Access Required</h4>
                <p className="text-xs text-slate-400 max-w-xs">{cameraError}</p>
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-2 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-xl transition-all shadow-md"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Bottom Control & Gallery Upload Bar */}
        <div className="w-full px-5 py-4 bg-slate-950/90 border-t border-white/10 flex flex-col items-center gap-3">
          <p className="text-xs text-slate-400 text-center font-medium">
            Align the QR code within the frame to scan automatically
          </p>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Upload QR Image from Gallery</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
