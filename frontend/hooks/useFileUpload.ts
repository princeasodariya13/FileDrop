"use client";

import { useCallback, useRef, useState } from "react";
import { createUploadSession, completeUpload, abortUpload } from "@/lib/api/uploads";
import { uploadPartWithProgress, ApiRequestError } from "@/lib/api/client";
import { CompletedPart, UploadOptions, UploadProgressState } from "@/types/upload";

const CONCURRENCY = 4;
const MAX_RETRIES_PER_PART = 3;

const initialState: UploadProgressState = {
  status: "idle",
  bytesUploaded: 0,
  totalBytes: 0,
  speedBytesPerSec: 0,
  etaSeconds: null,
  errorMessage: null,
  result: null,
};

export function useFileUpload() {
  const [state, setState] = useState<UploadProgressState>(initialState);
  const sessionIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const partProgressRef = useRef<Map<number, number>>(new Map());
  const speedSamplesRef = useRef<{ t: number; bytes: number }[]>([]);
  const lastUpdateRef = useRef<number>(0);

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

  const upload = useCallback(
    async (file: File, options: UploadOptions) => {
      partProgressRef.current = new Map();
      speedSamplesRef.current = [];
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        setState({ ...initialState, status: "validating", totalBytes: file.size });

        setState((s) => ({ ...s, status: "reserving" }));
        const session = await createUploadSession(file, options);
        sessionIdRef.current = session.sessionId;

        setState((s) => ({ ...s, status: "uploading" }));

        const completedParts: CompletedPart[] = [];
        const queue = [...session.parts];

        async function uploadOnePart(part: { partNumber: number; presignedUrl: string }) {
          const start = (part.partNumber - 1) * session.partSizeBytes;
          const end = Math.min(start + session.partSizeBytes, file.size);
          const blob = file.slice(start, end);

          let attempt = 0;
          while (true) {
            try {
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
                signal
              );
              completedParts.push({ partNumber: part.partNumber, etag });
              return;
            } catch (err) {
              if (signal.aborted) throw err;
              attempt++;
              if (attempt > MAX_RETRIES_PER_PART) throw err;
              await new Promise((r) => setTimeout(r, 500 * attempt)); // backoff
            }
          }
        }

        // Simple concurrency pool.
        let cursor = 0;
        async function worker() {
          while (cursor < queue.length) {
            const part = queue[cursor++];
            await uploadOnePart(part);
          }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

        setState((s) => ({ ...s, status: "completing" }));
        const result = await completeUpload(session.sessionId, completedParts);

        setState((s) => ({ ...s, status: "success", result }));
        return result;
      } catch (err) {
        if (signal.aborted) {
          setState((s) => ({ ...s, status: "cancelled" }));
          return;
        }
        const message =
          err instanceof ApiRequestError
            ? err.message
            : "Upload failed. Your file has not been saved.";
        setState((s) => ({ ...s, status: "failed", errorMessage: message }));
        // Best-effort cleanup so the storage reservation isn't held until it expires.
        if (sessionIdRef.current) {
          abortUpload(sessionIdRef.current).catch(() => {});
        }
        throw err;
      }
    },
    [updateProgress]
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    if (sessionIdRef.current) {
      abortUpload(sessionIdRef.current).catch(() => {});
    }
  }, []);

  const reset = useCallback(() => {
    sessionIdRef.current = null;
    setState(initialState);
  }, []);

  return { state, upload, cancel, reset };
}
