"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { useToast } from "@/components/ui/Toast";

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QRScannerModal({ isOpen, onClose }: QRScannerModalProps) {
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const scannedRef = useRef<boolean>(false);
  const barcodeDetectorRef = useRef<any>(null);
  const isDetectingRef = useRef<boolean>(false);
  const lastScanTimestamp = useRef<number>(0);

  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [scannedSuccess, setScannedSuccess] = useState<boolean>(false);

  const router = useRouter();
  const { push } = useToast();

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        barcodeDetectorRef.current = new (window as any).BarcodeDetector({
          formats: ["qr_code"],
        });
      } catch (e) {
        barcodeDetectorRef.current = null;
      }
    }
  }, []);

  // Check browser permission status if supported
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.permissions && navigator.permissions.query) {
      try {
        navigator.permissions.query({ name: "camera" as any }).then((result) => {
          setPermissionState(result.state);
          result.onchange = () => {
            setPermissionState(result.state);
          };
        }).catch(() => {});
      } catch (e) {}
    }
  }, []);

  // Play a soft beep sound on successful scan
  const playBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      // Audio might not be permitted without user gesture
    }
  }, []);

  // Stop active camera & animation
  const stopCameraStream = useCallback(() => {
    isScanningRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsTorchOn(false);
    setHasTorch(false);
    setIsLoadingCamera(false);
  }, []);

  // Process decoded QR code
  const handleDecodedData = useCallback(
    (rawData: string) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      setScannedSuccess(true);
      playBeep();

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(100);
        } catch (e) {}
      }

      push("QR Code scanned successfully!", "success");

      setTimeout(() => {
        stopCameraStream();
        onClose();

        const trimmed = rawData.trim();

        // 1. 6-digit number code
        if (/^\d{6}$/.test(trimmed)) {
          router.push(`/?code=${encodeURIComponent(trimmed)}`);
          return;
        }

        // 2. Full URL containing /room/ or /file/
        try {
          const urlObj = new URL(trimmed, window.location.origin);
          if (urlObj.pathname.startsWith("/room/")) {
            router.push(urlObj.pathname);
            return;
          }
          if (urlObj.pathname.startsWith("/file/")) {
            router.push(urlObj.pathname);
            return;
          }
        } catch {}

        // 3. Relative path like /room/123 or /file/123
        if (trimmed.startsWith("/room/")) {
          router.push(trimmed);
          return;
        }
        if (trimmed.startsWith("/file/")) {
          router.push(trimmed);
          return;
        }

        // 4. External URL or generic text
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          window.location.href = trimmed;
        } else {
          router.push(`/file/${encodeURIComponent(trimmed)}`);
        }
      }, 220);
    },
    [playBeep, push, stopCameraStream, onClose, router]
  );

  // Scan frame loop - Ultra-fast with Native BarcodeDetector + downscaled jsQR fallback throttled to ~15fps
  const scanLoop = useCallback(async () => {
    if (!isScanningRef.current || scannedRef.current) return;

    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      if (isScanningRef.current && !scannedRef.current) {
        animFrameRef.current = requestAnimationFrame(scanLoop);
      }
      return;
    }

    // Throttle decoding to at most once per 65ms (~15 fps) to save CPU and ensure 60fps video fluidity
    const now = performance.now();
    if (now - lastScanTimestamp.current < 65) {
      if (isScanningRef.current && !scannedRef.current) {
        animFrameRef.current = requestAnimationFrame(scanLoop);
      }
      return;
    }
    lastScanTimestamp.current = now;

    // 1. Hardware-accelerated Native BarcodeDetector (2-5ms execution directly on video element)
    if (barcodeDetectorRef.current && !isDetectingRef.current) {
      isDetectingRef.current = true;
      try {
        const barcodes = await barcodeDetectorRef.current.detect(video);
        if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
          handleDecodedData(barcodes[0].rawValue);
          isDetectingRef.current = false;
          return;
        }
      } catch (e) {
        // If BarcodeDetector failed unexpectedly, permanently switch to jsQR fallback
        barcodeDetectorRef.current = null;
      } finally {
        isDetectingRef.current = false;
      }
    }

    if (scannedRef.current) return;

    // 2. High-performance downscaled jsQR fallback (4-8ms execution on ~480px canvas)
    const canvas = canvasRef.current;
    if (canvas) {
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width > 0 && height > 0) {
        // Downscale to max 480px for lightning-fast pixel processing
        const scale = Math.min(1, 480 / Math.max(width, height));
        const scanWidth = Math.round(width * scale);
        const scanHeight = Math.round(height * scale);

        if (canvas.width !== scanWidth) canvas.width = scanWidth;
        if (canvas.height !== scanHeight) canvas.height = scanHeight;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, scanWidth, scanHeight);
          const imageData = ctx.getImageData(0, 0, scanWidth, scanHeight);
          const code = jsQR(imageData.data, scanWidth, scanHeight, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data) {
            handleDecodedData(code.data);
            return;
          }
        }
      }
    }

    if (isScanningRef.current && !scannedRef.current) {
      animFrameRef.current = requestAnimationFrame(scanLoop);
    }
  }, [handleDecodedData]);

  // Connect stream to video element safely and trigger playback
  const attachStreamToVideo = useCallback(
    (stream: MediaStream) => {
      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.setAttribute("muted", "true");

      const onReady = async () => {
        try {
          await video.play();
        } catch (err) {
          console.warn("Video play error:", err);
        }
        setIsLoadingCamera(false);
        isScanningRef.current = true;
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(scanLoop);
      };

      if (video.readyState >= 2 && video.videoWidth > 0) {
        onReady();
      } else {
        video.onloadedmetadata = () => onReady();
        video.oncanplay = () => onReady();
      }
    },
    [scanLoop]
  );

  // Progressive camera stream requester: mobile back camera first, universal video: true fallback for Windows & desktop
  const acquireCameraStream = useCallback(async (preferredFacing: "environment" | "user"): Promise<MediaStream> => {
    // Strategy 1: Ideal facingMode (preferred on mobile devices with back camera)
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: preferredFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (e1) {
      console.warn("Preferred facingMode failed, falling back to universal video constraint:", e1);
    }

    // Strategy 2: Universal fallback for Windows, laptops, and desktop webcams
    // Calling plain video: true prompts for permission and opens default webcam without constraint mismatch
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    } catch (e2) {
      console.warn("Universal video: true failed:", e2);
      throw e2;
    }
  }, []);

  // Start Camera
  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    setCameraError(null);
    setIsLoadingCamera(true);
    setScannedSuccess(false);
    scannedRef.current = false;

    // Check secure context (HTTPS / localhost required by browsers)
    if (
      typeof window !== "undefined" &&
      !window.isSecureContext &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      setHasCamera(false);
      setIsLoadingCamera(false);
      setCameraError("Camera access requires HTTPS or localhost. If opening from mobile, connect via HTTPS or upload a QR image below.");
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setHasCamera(false);
      setIsLoadingCamera(false);
      setCameraError("Camera is not supported on this browser or device.");
      return;
    }

    try {
      const stream = await acquireCameraStream(facingMode);
      streamRef.current = stream;
      setHasCamera(true);
      setCameraError(null);
      setPermissionState("granted");

      const track = stream.getVideoTracks()[0];
      if (track) {
        // Enable continuous autofocus if supported on device
        try {
          const caps: any = track.getCapabilities ? track.getCapabilities() : {};
          if (caps.focusMode && caps.focusMode.includes("continuous")) {
            await (track as any).applyConstraints({
              advanced: [{ focusMode: "continuous" }],
            });
          }
          if (caps.torch) {
            setHasTorch(true);
          }
        } catch (e) {}
      }

      attachStreamToVideo(stream);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setHasCamera(false);
      setIsLoadingCamera(false);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setPermissionState("denied");
        setCameraError("Please allow camera access to scan QR codes.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No camera device was detected on your system.");
      } else {
        setCameraError("Unable to open camera. Please click Try Again or upload a QR image.");
      }
    }
  }, [facingMode, acquireCameraStream, attachStreamToVideo, stopCameraStream]);

  // Direct user-gesture handler: explicitly triggers the browser's camera permission prompt
  const handleRequestPermission = async () => {
    setIsLoadingCamera(true);
    setCameraError(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setHasCamera(false);
      setIsLoadingCamera(false);
      setCameraError("Camera is not supported on this browser or device.");
      return;
    }

    try {
      const stream = await acquireCameraStream(facingMode);
      streamRef.current = stream;
      setHasCamera(true);
      setCameraError(null);
      setPermissionState("granted");
      attachStreamToVideo(stream);
    } catch (err: any) {
      console.error("Direct permission request error:", err);
      setIsLoadingCamera(false);
      setHasCamera(false);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setPermissionState("denied");
        setCameraError("Camera permission was not granted. Please allow camera access in the browser prompt or address bar, then click Try Again.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setCameraError("No camera device was detected on your system.");
      } else {
        setCameraError("Unable to open camera. Please click Try Again or upload a QR image.");
      }
    }
  };

  // Keep video element synced with stream whenever mounted
  useEffect(() => {
    if (isOpen && streamRef.current && videoRef.current && !videoRef.current.srcObject) {
      attachStreamToVideo(streamRef.current);
    }
  }, [isOpen, attachStreamToVideo]);

  // Toggle torch / flash
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const next = !isTorchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: next }],
        });
        setIsTorchOn(next);
      } catch (e) {
        console.error("Failed to toggle torch:", e);
      }
    }
  };

  // Flip camera between back & front
  const flipCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  // Handle uploaded QR image file
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
          handleDecodedData(code.data);
        } else {
          push("No valid QR code found in the uploaded image.", "error");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Handle camera mount/unmount and facing mode changes
  useEffect(() => {
    if (isOpen) {
      startCameraStream();
    } else {
      stopCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [isOpen, facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle Escape key
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

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          stopCameraStream();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="QR Code Scanner"
    >
      <div className="relative w-full max-w-sm sm:max-w-md overflow-hidden rounded-3xl modal-card shadow-2xl animate-fade-in-scale flex flex-col items-center z-[100000]">
        {/* Top Header Bar */}
        <div className="w-full flex items-center justify-between px-5 py-3.5 bg-surface/80 dark:bg-surface/50 border-b border-surface-hover backdrop-blur-sm z-20">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/15 text-brand-500 border border-brand-500/25">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              </svg>
            </span>
            <div>
              <h3 className="text-sm font-bold modal-title font-heading leading-tight">Scan QR Code</h3>
              <p className="text-[11px] modal-sub font-mono">Align code inside frame</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Flashlight button */}
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-full border transition-all ${
                  isTorchOn
                    ? "bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                    : "bg-surface hover:bg-surface-hover border-surface-hover text-ink-300 hover:text-ink-50"
                }`}
                title={isTorchOn ? "Turn off Flash" : "Turn on Flash"}
                aria-label="Toggle Flashlight"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </button>
            )}

            {/* Switch Camera */}
            {hasCamera && (
              <button
                type="button"
                onClick={flipCamera}
                className="p-2 rounded-full bg-surface hover:bg-surface-hover border border-surface-hover text-ink-300 hover:text-ink-50 transition-colors"
                title="Switch Camera (Front/Back)"
                aria-label="Flip Camera"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0-4.418-3.582-8-8-8s-8 3.582-8 8c0 2.21 0.895 4.21 2.343 5.657L4 18h5v-5l-1.929 1.929C5.836 13.693 5 11.95 5 10c0-3.866 3.134-7 7-7s7 3.134 7 7-3.134 7-7 7a6.97 6.97 0 0 1-4.95-2.05" />
                </svg>
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                onClose();
              }}
              className="p-2 rounded-full bg-surface hover:bg-surface-hover border border-surface-hover text-ink-300 hover:text-ink-50 transition-colors ml-1"
              aria-label="Close scanner"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Camera Live Viewfinder Area */}
        <div className="relative w-full h-[340px] sm:h-[380px] bg-black flex items-center justify-center overflow-hidden">
          {/* Live Video Feed */}
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Hidden Canvas for QR parsing */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Loading indicator when camera is spinning up */}
          {isLoadingCamera && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/85 z-10 animate-fade-in">
              <div className="h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
              <p className="text-xs font-medium text-ink-300">Opening camera...</p>
            </div>
          )}

          {/* Scanner Focus Frame & Cutout */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Viewfinder Target Box */}
            <div
              className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-3xl"
              style={{
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
              }}
            >
              {/* Corner 1: Top-Left */}
              <div
                className={`absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 rounded-tl-2xl transition-colors duration-300 ${
                  scannedSuccess ? "border-emerald-400" : "border-brand-500"
                }`}
              />
              {/* Corner 2: Top-Right */}
              <div
                className={`absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 rounded-tr-2xl transition-colors duration-300 ${
                  scannedSuccess ? "border-emerald-400" : "border-brand-500"
                }`}
              />
              {/* Corner 3: Bottom-Left */}
              <div
                className={`absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 rounded-bl-2xl transition-colors duration-300 ${
                  scannedSuccess ? "border-emerald-400" : "border-brand-500"
                }`}
              />
              {/* Corner 4: Bottom-Right */}
              <div
                className={`absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 rounded-br-2xl transition-colors duration-300 ${
                  scannedSuccess ? "border-emerald-400" : "border-brand-500"
                }`}
              />

              {/* Animated Laser Scanning Beam */}
              {!scannedSuccess && hasCamera && !isLoadingCamera && (
                <div className="absolute left-2 right-2 h-1 bg-gradient-to-r from-transparent via-brand-500 to-transparent shadow-[0_0_15px_#f1470c] rounded-full animate-scan-laser pointer-events-none" />
              )}

              {/* Success Verified Overlay */}
              {scannedSuccess && (
                <div className="absolute inset-0 rounded-3xl bg-emerald-500/30 backdrop-blur-xs flex flex-col items-center justify-center gap-2 animate-fade-in">
                  <div className="h-12 w-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/50 animate-bounce">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="text-xs font-bold text-emerald-300 bg-slate-950/90 px-3 py-1 rounded-full border border-emerald-400/50">
                    QR Scanned!
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Camera Error / Permission Fallback View - Single Try Again Button */}
          {cameraError && (
            <div className="absolute inset-0 bg-panel/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4 z-20 animate-fade-in">
              <div className="h-12 w-12 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-500 flex items-center justify-center shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>

              <div className="space-y-1.5 max-w-xs">
                <h4 className="text-sm font-bold modal-title font-heading">Camera Access Required</h4>
                <p className="text-xs modal-sub text-ink-300 leading-relaxed">
                  {cameraError}
                </p>
              </div>

              <button
                type="button"
                onClick={handleRequestPermission}
                className="px-6 py-2.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-full transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Try Again</span>
              </button>
            </div>
          )}
        </div>

        {/* Bottom Bar: Instructions & Gallery Image Upload */}
        <div className="w-full px-5 py-3.5 bg-surface/80 dark:bg-surface/50 border-t border-surface-hover flex flex-col items-center gap-2.5">
          <p className="text-xs modal-sub text-center font-medium">
            Point camera at QR code or upload from gallery
          </p>

          <div>
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface hover:bg-surface-hover border border-surface-hover text-xs font-medium text-ink-200 hover:text-ink-50 transition-colors cursor-pointer"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Upload QR Image</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
