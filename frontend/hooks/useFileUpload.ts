"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { createUploadSession, completeUpload, abortUpload, refreshPartUrls } from "@/lib/api/uploads";
import { uploadPartWithProgress, ApiRequestError } from "@/lib/api/client";
import { CompletedPart, UploadOptions, UploadProgressState } from "@/types/upload";

const initialState: UploadProgressState = {
  status: "idle",
  bytesUploaded: 0,
  totalBytes: 0,
  speedBytesPerSec: 0,
  etaSeconds: null,
  errorMessage: null,
  result: null,
  telemetry: {
    concurrency: 4,
    averagePartUploadTimeMs: 0,
    retryCount: 0,
  },
};

export function useFileUpload() {
  const [state, setState] = useState<UploadProgressState>(initialState);
  const sessionIdRef = useRef<string | null>(null);

  const userCancelControllerRef = useRef<AbortController | null>(null);
  const pauseControllerRef = useRef<AbortController | null>(null);

  const partProgressRef = useRef<Map<number, number>>(new Map());
  const speedSamplesRef = useRef<{ t: number; bytes: number }[]>([]);
  const lastUpdateRef = useRef<number>(0);

  const completedPartsRef = useRef<Map<number, string>>(new Map());
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  // Expose refs for the worker pool to read current state
  const isPausedRef = useRef<boolean>(false);
  const queueRef = useRef<{ partNumber: number; presignedUrl: string }[]>([]);
  const isUploadingRef = useRef<boolean>(false); // tracks if workers are currently running

  const updateProgress = useCallback((totalBytes: number) => {
    const uploaded = Array.from(partProgressRef.current.values()).reduce((a, b) => a + b, 0);
    const now = Date.now();
    speedSamplesRef.current.push({ t: now, bytes: uploaded });
    speedSamplesRef.current = speedSamplesRef.current.filter((s) => now - s.t < 5000);

    let speed = 0;
    if (speedSamplesRef.current.length >= 2) {
      const first = speedSamplesRef.current[0];
      const last = speedSamplesRef.current[speedSamplesRef.current.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0) speed = (last.bytes - first.bytes) / dt;
    }

    const remaining = totalBytes - uploaded;
    const eta = speed > 0 ? remaining / speed : null;

    setState((prev) => ({
      ...prev,
      bytesUploaded: uploaded,
      totalBytes,
      speedBytesPerSec: speed,
      etaSeconds: eta,
    }));
  }, []);

  // Shared file ref so online/offline event handlers can access it if needed
  const fileRef = useRef<File | null>(null);
  const partSizeRef = useRef<number>(0);

  const startWorkers = useCallback(async () => {
    if (isUploadingRef.current || isPausedRef.current || !fileRef.current || !sessionIdRef.current) return;
    isUploadingRef.current = true;

    pauseControllerRef.current = new AbortController();
    const pauseSignal = pauseControllerRef.current.signal;
    const cancelSignal = userCancelControllerRef.current?.signal;

    const file = fileRef.current;
    const partSize = partSizeRef.current;

    const hwConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const maxAllowedConcurrency = Math.min(8, Math.max(4, hwConcurrency));
    const MIN_CONCURRENCY = 2;
    
    let targetConcurrency = 4;
    let consecutiveSuccesses = 0;
    let consecutiveErrors = 0;

    let totalUploadTimeMs = 0;
    let partsCompletedByWorkers = 0;
    let totalRetries = 0;

    const updateTelemetry = () => {
      setState((prev) => ({
        ...prev,
        telemetry: {
          concurrency: targetConcurrency,
          averagePartUploadTimeMs: partsCompletedByWorkers > 0 ? totalUploadTimeMs / partsCompletedByWorkers : 0,
          retryCount: totalRetries,
        },
      }));
    };
    
    const activeWorkers = new Set<Promise<void>>();

    async function uploadOnePart(part: { partNumber: number; presignedUrl: string }, onRetry: () => void) {
      if (completedPartsRef.current.has(part.partNumber)) {
        partProgressRef.current.set(part.partNumber, Math.min(partSize, file.size - (part.partNumber - 1) * partSize));
        return;
      }

      const start = (part.partNumber - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);

      let attempt = 0;
      while (true) {
        if (cancelSignal?.aborted) throw new Error("CANCELLED");
        if (pauseSignal.aborted || isPausedRef.current) throw new Error("PAUSED");

        try {
          // Wait for any active URL refreshes
          if (refreshPromiseRef.current) {
            await refreshPromiseRef.current;
            // Update URL from queueRef
            const updatedPart = queueRef.current.find(p => p.partNumber === part.partNumber);
            if (updatedPart) part.presignedUrl = updatedPart.presignedUrl;
          }

          // Combined signal to stop XHR on user cancel OR network pause
          const xhrController = new AbortController();
          const onCancelOrPause = () => xhrController.abort();
          cancelSignal?.addEventListener("abort", onCancelOrPause);
          pauseSignal.addEventListener("abort", onCancelOrPause);

          const etag = await uploadPartWithProgress(
            part.presignedUrl,
            blob,
            (loaded) => {
              partProgressRef.current.set(part.partNumber, loaded);
              const now = Date.now();
              const isFinished = loaded >= blob.size;
              if (isFinished || now - lastUpdateRef.current >= 250) {
                lastUpdateRef.current = now;
                updateProgress(file.size);
              }
            },
            xhrController.signal
          );

          cancelSignal?.removeEventListener("abort", onCancelOrPause);
          pauseSignal.removeEventListener("abort", onCancelOrPause);

          completedPartsRef.current.set(part.partNumber, etag);
          return;
        } catch (err: any) {
          if (cancelSignal?.aborted) throw new Error("CANCELLED");
          if (pauseSignal.aborted || isPausedRef.current) throw new Error("PAUSED");

          const msg = err.message || "";

          // HTTP 403 Expired URL
          if (msg.includes("status 403")) {
            if (!refreshPromiseRef.current) {
              refreshPromiseRef.current = refreshPartUrls(sessionIdRef.current!).then(res => {
                queueRef.current = res.parts;
              }).finally(() => {
                refreshPromiseRef.current = null;
              });
            }
            continue; // retry immediately after refresh
          }

          // Permanent 4xx errors
          const statusMatch = msg.match(/status (\d{3})/);
          if (statusMatch) {
            const status = parseInt(statusMatch[1], 10);
            if (status >= 400 && status < 500 && status !== 403 && status !== 408 && status !== 429) {
              throw err; // permanent failure
            }
          }

          attempt++;
          onRetry();
          const delay = Math.min(16000, 1000 * (2 ** (attempt - 1))); // 1s, 2s, 4s, 8s, 16s

          if (!navigator.onLine) {
            // If genuinely offline, just pause wait instead of spinning the backoff
            throw new Error("PAUSED");
          }

          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    let cursor = 0;
    let hasError = false;

    function ensureWorkers(resolve: () => void, reject: (err: any) => void) {
      if (hasError || cancelSignal?.aborted || pauseSignal.aborted || isPausedRef.current) {
        if (activeWorkers.size === 0) resolve();
        return;
      }
      
      while (activeWorkers.size < targetConcurrency && cursor < queueRef.current.length) {
        const workerPromise = worker(resolve, reject);
        activeWorkers.add(workerPromise);
        workerPromise.finally(() => {
          activeWorkers.delete(workerPromise);
          if (activeWorkers.size === 0 && cursor >= queueRef.current.length) {
            resolve();
          } else {
            ensureWorkers(resolve, reject);
          }
        });
      }
      
      if (activeWorkers.size === 0 && cursor >= queueRef.current.length) {
        resolve();
      }
    }

    async function worker(resolve: () => void, reject: (err: any) => void) {
      while (cursor < queueRef.current.length) {
        if (hasError || cancelSignal?.aborted || pauseSignal.aborted || isPausedRef.current) break;
        if (activeWorkers.size > targetConcurrency) break; // Scale down

        const partIndex = cursor++;
        const part = queueRef.current[partIndex];
        
        if (completedPartsRef.current.has(part.partNumber)) {
          partProgressRef.current.set(part.partNumber, Math.min(partSize, file.size - (part.partNumber - 1) * partSize));
          continue;
        }

        let retried = false;
        const handleRetry = () => {
          retried = true;
          totalRetries++;
          consecutiveSuccesses = 0;
          consecutiveErrors++;
          if (consecutiveErrors >= 2 && targetConcurrency > MIN_CONCURRENCY) {
            targetConcurrency--;
            consecutiveErrors = 0;
          }
          updateTelemetry();
        };

        try {
          const start = Date.now();
          await uploadOnePart(part, handleRetry);
          const duration = Date.now() - start;
          
          totalUploadTimeMs += duration;
          partsCompletedByWorkers++;
          
          if (!retried) {
            consecutiveErrors = 0;
            consecutiveSuccesses++;
            if (consecutiveSuccesses >= 3 && targetConcurrency < maxAllowedConcurrency) {
              targetConcurrency++;
              consecutiveSuccesses = 0;
            }
          }
          updateTelemetry();

        } catch (err: any) {
          if (err.message === "PAUSED" || err.message === "CANCELLED") {
            // Put it back in the queue for resume
            cursor = Math.min(cursor, partIndex);
            break;
          }
          hasError = true;
          reject(err);
          break;
        }
      }
    }

    try {
      updateTelemetry();
      await new Promise<void>((resolve, reject) => {
        ensureWorkers(resolve, reject);
      });

      if (cancelSignal?.aborted) return;
      if (pauseSignal.aborted || isPausedRef.current) return;

      // Verify all expected parts completed
      const totalExpected = queueRef.current.length;
      if (completedPartsRef.current.size !== totalExpected) {
        throw new Error("Missing parts. Cannot complete.");
      }
      for (let i = 1; i <= totalExpected; i++) {
        if (!completedPartsRef.current.has(i)) {
          throw new Error(`Missing part ${i}. Cannot complete.`);
        }
      }

      setState((s) => ({ ...s, status: "completing" }));

      const partsToComplete = Array.from(completedPartsRef.current.entries())
        .map(([partNumber, etag]) => ({ partNumber, etag }))
        .sort((a, b) => a.partNumber - b.partNumber);

      const result = await completeUpload(sessionIdRef.current, partsToComplete);
      setState((s) => ({ ...s, status: "success", result }));
    } catch (err: any) {
      if (cancelSignal?.aborted || err.message === "CANCELLED") return;
      if (pauseSignal.aborted || isPausedRef.current || err.message === "PAUSED") return;

      const message = err instanceof ApiRequestError ? err.message : "Upload failed. Your file has not been saved.";
      setState((s) => ({ ...s, status: "failed", errorMessage: message }));
    } finally {
      isUploadingRef.current = false;
    }
  }, [updateProgress]);

  const upload = useCallback(
    async (file: File, options: UploadOptions) => {
      userCancelControllerRef.current = new AbortController();
      partProgressRef.current = new Map();
      completedPartsRef.current = new Map();
      speedSamplesRef.current = [];
      isPausedRef.current = false;
      isUploadingRef.current = false;
      fileRef.current = file;

      try {
        setState({ ...initialState, status: "validating", totalBytes: file.size });
        setState((s) => ({ ...s, status: "reserving" }));

        const session = await createUploadSession(file, options);
        sessionIdRef.current = session.sessionId;
        queueRef.current = session.parts;
        partSizeRef.current = session.partSizeBytes;

        setState((s) => ({ ...s, status: "uploading" }));
        startWorkers();

      } catch (err: any) {
        if (userCancelControllerRef.current?.signal.aborted) {
          setState((s) => ({ ...s, status: "cancelled" }));
          return;
        }
        setState((s) => ({ ...s, status: "failed", errorMessage: err.message || "Failed to start upload." }));
      }
    },
    [startWorkers]
  );

  useEffect(() => {
    const handleOffline = () => {
      if (isUploadingRef.current) {
        isPausedRef.current = true;
        pauseControllerRef.current?.abort();
        setState((prev) => prev.status === "uploading" ? { ...prev, status: "paused" } : prev);
      }
    };
    const handleOnline = () => {
      if (isPausedRef.current && sessionIdRef.current) {
        isPausedRef.current = false;
        setState((prev) => prev.status === "paused" ? { ...prev, status: "uploading" } : prev);
        startWorkers();
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [startWorkers]);

  const cancel = useCallback(() => {
    userCancelControllerRef.current?.abort();
    pauseControllerRef.current?.abort();
    if (sessionIdRef.current) {
      abortUpload(sessionIdRef.current).catch(() => {});
    }
    setState((s) => ({ ...s, status: "cancelled" }));
  }, []);

  const reset = useCallback(() => {
    sessionIdRef.current = null;
    fileRef.current = null;
    setState(initialState);
  }, []);

  return { state, upload, cancel, reset };
}
