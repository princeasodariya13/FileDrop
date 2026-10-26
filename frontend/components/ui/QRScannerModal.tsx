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
  const router = useRouter();
  const { push } = useToast();

  // Video, canvas, stream and session references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCaptureRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const scannedRef = useRef<boolean>(false);
  const barcodeDetectorRef = useRef<any>(null);
  const isDetectingRef = useRef<boolean>(false);
  const lastScanTimestamp = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const activeSessionRef = useRef<number>(0);

  // States
  const [hasCamera, setHasCamera] = useState<boolean>(true);
  const [isLoadingCamera, setIsLoadingCamera] = useState<boolean>(true);
  const [cameraBlocked, setCameraBlocked] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [scannedSuccess, setScannedSuccess] = useState<boolean>(false);

  // Synchronous mount & BarcodeDetector setup
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

  // Soft audio chime on successful scan
  const playBeep = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
  }, []);

  // Cleanly stop active tracks and animations WITHOUT changing activeSessionRef
  const stopActiveTracks = useCallback(() => {
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
  }, []);

  // Full camera teardown on close/unmount
  const stopCameraStream = useCallback(() => {
    activeSessionRef.current += 1;
    stopActiveTracks();
    setIsLoadingCamera(false);
  }, [stopActiveTracks]);

  // Process decoded QR code data and route user instantly
  const handleDecodedData = useCallback(
    (rawData: string) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      setScannedSuccess(true);
      playBeep();

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(80);
        } catch (e) {}
      }

      push("QR Code scanned successfully!", "success");

      setTimeout(() => {
        stopCameraStream();
        onClose();

        const trimmed = rawData.trim();

        // 1. 6-digit numeric code (e.g. 123456)
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

        // 3. Relative path
        if (trimmed.startsWith("/room/")) {
          router.push(trimmed);
          return;
        }
        if (trimmed.startsWith("/file/")) {
          router.push(trimmed);
          return;
        }

        // 4. 6-character room code (alphanumeric, e.g. A2B4C6)
        if (/^[A-Za-z0-9]{6}$/.test(trimmed)) {
          router.push(`/room/${encodeURIComponent(trimmed.toUpperCase())}`);
          return;
        }

        // 5. External URL or generic text
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          window.location.href = trimmed;
        } else {
          router.push(`/file/${encodeURIComponent(trimmed)}`);
        }
      }, 180);
    },
    [playBeep, push, stopCameraStream, onClose, router]
  );

  // High-performance scanning loop with center-crop optimization
  const scanLoop = useCallback(async () => {
    if (!isScanningRef.current || scannedRef.current) return;

    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      if (isScanningRef.current && !scannedRef.current) {
        animFrameRef.current = requestAnimationFrame(scanLoop);
      }
      return;
    }

    // Fast throttle to ~35-40 scans per second (25ms) for instant responsiveness
    const now = performance.now();
    if (now - lastScanTimestamp.current < 25) {
      if (isScanningRef.current && !scannedRef.current) {
        animFrameRef.current = requestAnimationFrame(scanLoop);
      }
      return;
    }
    lastScanTimestamp.current = now;
    frameCountRef.current += 1;

    // 1. Hardware-accelerated Native BarcodeDetector (1-3ms directly on video element)
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
        // Continue scanning
      } finally {
        isDetectingRef.current = false;
      }
    }

    if (scannedRef.current) return;

    // 2. High-speed jsQR parsing with center-crop optimization
    const canvas = canvasRef.current;
    if (canvas) {
      const vWidth = video.videoWidth;
      const vHeight = video.videoHeight;

      if (vWidth > 0 && vHeight > 0) {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          // On even frames: CROP THE CENTER SQUARE (Viewfinder Target Area)
          // Maximum optical resolution for the QR code right in front of user
          if (frameCountRef.current % 2 === 0) {
            const minDim = Math.min(vWidth, vHeight);
            const cropSize = Math.round(minDim * 0.72);
            const cropX = Math.round((vWidth - cropSize) / 2);
            const cropY = Math.round((vHeight - cropSize) / 2);
            const targetDim = 380;

            if (canvas.width !== targetDim || canvas.height !== targetDim) {
              canvas.width = targetDim;
              canvas.height = targetDim;
            }

            ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, targetDim, targetDim);
            const imgData = ctx.getImageData(0, 0, targetDim, targetDim);
            const code = jsQR(imgData.data, targetDim, targetDim, {
              inversionAttempts: "attemptBoth",
            });

            if (code && code.data) {
              handleDecodedData(code.data);
              return;
            }
          } else {
            // On odd frames: check full frame (scaled to 420px width) in case QR is off-center
            const scale = Math.min(1, 420 / Math.max(vWidth, vHeight));
            const fullW = Math.round(vWidth * scale);
            const fullH = Math.round(vHeight * scale);

            if (canvas.width !== fullW || canvas.height !== fullH) {
              canvas.width = fullW;
              canvas.height = fullH;
            }

            ctx.drawImage(video, 0, 0, fullW, fullH);
            const imgData = ctx.getImageData(0, 0, fullW, fullH);
            const code = jsQR(imgData.data, fullW, fullH, {
              inversionAttempts: "attemptBoth",
            });

            if (code && code.data) {
              handleDecodedData(code.data);
              return;
            }
          }
        }
      }
    }

    if (isScanningRef.current && !scannedRef.current) {
      animFrameRef.current = requestAnimationFrame(scanLoop);
    }
  }, [handleDecodedData]);

  // Robust cross-browser MediaStream acquisition
  const getMediaStream = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      return await navigator.mediaDevices.getUserMedia(constraints);
    }
    const legacy =
      (navigator as any)?.getUserMedia ||
      (navigator as any)?.webkitGetUserMedia ||
      (navigator as any)?.mozGetUserMedia ||
      (navigator as any)?.msGetUserMedia;
    if (legacy) {
      return new Promise((resolve, reject) => {
        legacy.call(navigator, constraints, resolve, reject);
      });
    }
    throw new Error("Camera API not available");
  };

  // Start Camera - opens camera immediately without instruction message overlays
  const startCameraStream = useCallback(
    async (targetMode: "environment" | "user" = facingMode) => {
      const currentSession = ++activeSessionRef.current;
      stopActiveTracks();

      setIsLoadingCamera(true);
      setCameraBlocked(false);
      setScannedSuccess(false);
      scannedRef.current = false;

      let stream: MediaStream | null = null;

      try {
        // Attempt 1: Ideal facingMode without rigid resolution constraints
        // This opens camera immediately on mobile without negotiation latency
        try {
          stream = await getMediaStream({
            video: { facingMode: { ideal: targetMode } },
            audio: false,
          });
        } catch (e1) {
          // Attempt 2: Direct facingMode
          try {
            stream = await getMediaStream({
              video: { facingMode: targetMode },
              audio: false,
            });
          } catch (e2) {
            // Attempt 3: Universal fallback (works on all Windows webcams & phones)
            try {
              stream = await getMediaStream({
                video: true,
                audio: false,
              });
            } catch (e3) {
              // Attempt 4: Pick first videoinput device if available
              if (navigator.mediaDevices?.enumerateDevices) {
                const devs = await navigator.mediaDevices.enumerateDevices();
                const videoDev = devs.find((d) => d.kind === "videoinput");
                if (videoDev) {
                  stream = await getMediaStream({
                    video: { deviceId: { exact: videoDev.deviceId } },
                    audio: false,
                  });
                } else {
                  throw e3;
                }
              } else {
                throw e3;
              }
            }
          }
        }

        // Verify session was not cancelled
        if (activeSessionRef.current !== currentSession) {
          if (stream) {
            stream.getTracks().forEach((t) => t.stop());
          }
          return;
        }

        streamRef.current = stream;
        setHasCamera(true);
        setCameraBlocked(false);

        // Check torch capabilities
        const track = stream.getVideoTracks()[0];
        if (track) {
          try {
            const caps: any = track.getCapabilities ? track.getCapabilities() : {};
            if (caps && caps.torch) {
              setHasTorch(true);
            }
          } catch {}
        }

        // Attach stream to video element
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          video.setAttribute("webkit-playsinline", "true");
          video.setAttribute("muted", "true");
          video.muted = true;
          video.defaultMuted = true;

          let scanStarted = false;
          const launchScan = () => {
            if (scanStarted) return;
            if (activeSessionRef.current !== currentSession) return;
            scanStarted = true;
            setIsLoadingCamera(false);
            isScanningRef.current = true;
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = requestAnimationFrame(scanLoop);
          };

          video.onloadedmetadata = launchScan;
          video.oncanplay = launchScan;
          video.onplaying = launchScan;

          try {
            const playPromise = video.play();
            if (playPromise !== undefined) {
              playPromise.then(launchScan).catch(() => {
                launchScan();
              });
            }
          } catch {
            launchScan();
          }

          if (video.readyState >= 1) {
            launchScan();
          }
        }
      } catch (err: any) {
        if (activeSessionRef.current !== currentSession) return;
        console.warn("Live camera stream unavailable:", err);
        setIsLoadingCamera(false);
        setCameraBlocked(true);
      }
    },
    [facingMode, scanLoop, stopActiveTracks]
  );

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
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    startCameraStream(nextMode);
  };

  // High-accuracy multi-scale decoder for mobile photos and gallery images
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingCamera(true);
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (event) => {
      img.onload = async () => {
        try {
          // 1. Hardware BarcodeDetector on raw image
          if (typeof window !== "undefined" && "BarcodeDetector" in window) {
            try {
              const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
              const barcodes = await detector.detect(img);
              if (barcodes && barcodes.length > 0 && barcodes[0]?.rawValue) {
                handleDecodedData(barcodes[0].rawValue);
                return;
              }
            } catch {}
          }

          // 2. jsQR Multi-Scale Passes
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;

          // Scale 1: 1000px max dimension
          const maxDim1 = 1000;
          let w1 = img.width;
          let h1 = img.height;
          if (w1 > maxDim1 || h1 > maxDim1) {
            if (w1 > h1) {
              h1 = Math.round((h1 * maxDim1) / w1);
              w1 = maxDim1;
            } else {
              w1 = Math.round((w1 * maxDim1) / h1);
              h1 = maxDim1;
            }
          }
          canvas.width = w1;
          canvas.height = h1;
          ctx.drawImage(img, 0, 0, w1, h1);
          let imgData = ctx.getImageData(0, 0, w1, h1);
          let code = jsQR(imgData.data, w1, h1, { inversionAttempts: "attemptBoth" });

          if (code && code.data) {
            handleDecodedData(code.data);
            return;
          }

          // Scale 2: 650px high-contrast pass
          const maxDim2 = 650;
          let w2 = img.width;
          let h2 = img.height;
          if (w2 > maxDim2 || h2 > maxDim2) {
            if (w2 > h2) {
              h2 = Math.round((h2 * maxDim2) / w2);
              w2 = maxDim2;
            } else {
              w2 = Math.round((w2 * maxDim2) / h2);
              h2 = maxDim2;
            }
          }
          canvas.width = w2;
          canvas.height = h2;
          ctx.drawImage(img, 0, 0, w2, h2);
          imgData = ctx.getImageData(0, 0, w2, h2);
          code = jsQR(imgData.data, w2, h2, { inversionAttempts: "attemptBoth" });

          if (code && code.data) {
            handleDecodedData(code.data);
            return;
          }

          // Scale 3: Center crop (75% of center at 550x550)
          const cropDim = Math.round(Math.min(w1, h1) * 0.75);
          const cropX = Math.round((w1 - cropDim) / 2);
          const cropY = Math.round((h1 - cropDim) / 2);
          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = 550;
          cropCanvas.height = 550;
          const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
          if (cropCtx) {
            cropCtx.drawImage(canvas, cropX, cropY, cropDim, cropDim, 0, 0, 550, 550);
            const cropData = cropCtx.getImageData(0, 0, 550, 550);
            code = jsQR(cropData.data, 550, 550, { inversionAttempts: "attemptBoth" });
            if (code && code.data) {
              handleDecodedData(code.data);
              return;
            }
          }

          push("No QR code detected. Please ensure code is clear and in focus.", "error");
        } finally {
          setIsLoadingCamera(false);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Mount/unmount camera lifecycle: triggers ONCE when modal opens
  useEffect(() => {
    if (isOpen) {
      startCameraStream();
    } else {
      stopCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {/* Hidden native mobile camera capture input */}
        <input
          ref={mobileCaptureRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleImageUpload}
        />

        {/* Hidden gallery file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

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
              <p className="text-[11px] modal-sub font-mono">Point camera at code</p>
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
            {hasCamera && !cameraBlocked && (
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
          {isLoadingCamera && !cameraBlocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/75 z-10 animate-fade-in pointer-events-none">
              <div className="h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
              <p className="text-xs font-medium text-ink-300">Starting camera...</p>
            </div>
          )}

          {/* Scanner Focus Frame & Cutout */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Viewfinder Target Box */}
            <div
              className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-3xl"
              style={{
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.52)",
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
              {!scannedSuccess && !cameraBlocked && (
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

          {/* Seamless Fallback if camera stream is blocked by device permissions or LAN context */}
          {cameraBlocked && (
            <div className="absolute inset-0 bg-surface/90 dark:bg-panel/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4 z-20 animate-fade-in">
              <div className="h-14 w-14 rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-500 flex items-center justify-center shrink-0">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>

              <div className="space-y-1 max-w-xs">
                <h4 className="text-sm font-bold modal-title font-heading">Camera Access</h4>
                <p className="text-xs modal-sub text-ink-300">
                  Tap below to scan directly with your device camera
                </p>
              </div>

              <div className="flex flex-col items-center gap-2 w-full max-w-xs pt-1">
                <button
                  type="button"
                  onClick={() => mobileCaptureRef.current?.click()}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-full transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Open Device Camera</span>
                </button>

                <button
                  type="button"
                  onClick={() => startCameraStream()}
                  className="w-full py-2 px-4 text-xs font-medium text-ink-300 hover:text-ink-50 bg-transparent rounded-full transition-all cursor-pointer"
                >
                  Retry Live Stream
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Bar: Instant Actions */}
        <div className="w-full px-5 py-3.5 bg-surface/80 dark:bg-surface/50 border-t border-surface-hover flex flex-col items-center gap-2.5">
          <p className="text-xs modal-sub text-center font-medium">
            Align code inside frame or scan with camera photo
          </p>

          <div className="flex items-center gap-2 flex-wrap justify-center">
            <button
              type="button"
              onClick={() => mobileCaptureRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-xs font-semibold text-brand-500 transition-colors cursor-pointer"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span>Phone Camera</span>
            </button>

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
