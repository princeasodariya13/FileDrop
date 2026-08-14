import { apiFetch } from "./client";
import { CompleteUploadResponse, CompletedPart, CreateSessionResponse, UploadOptions } from "@/types/upload";

export async function createUploadSession(
  file: File,
  options: UploadOptions
): Promise<CreateSessionResponse> {
  return apiFetch<CreateSessionResponse>("/api/uploads/session", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
      expirationSeconds: options.expirationSeconds,
      downloadLimit: options.downloadLimit,
    }),
  });
}

export async function refreshPartUrls(sessionId: string) {
  return apiFetch<{ parts: { partNumber: number; presignedUrl: string }[] }>(
    `/api/uploads/${sessionId}/parts/refresh`,
    { method: "POST" }
  );
}

export async function completeUpload(
  sessionId: string,
  parts: CompletedPart[]
): Promise<CompleteUploadResponse> {
  return apiFetch<CompleteUploadResponse>("/api/uploads/complete", {
    method: "POST",
    body: JSON.stringify({ sessionId, parts }),
  });
}

export async function abortUpload(sessionId: string): Promise<void> {
  await apiFetch("/api/uploads/abort", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function sendHeartbeat(sessionId: string): Promise<void> {
  await apiFetch("/api/uploads/heartbeat", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export interface ResumeSessionResponse {
  sessionId: string;
  status: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  partSizeBytes: number;
  totalParts: number;
  parts: { partNumber: number; etag: string }[];
}

export async function resumeUploadData(sessionId: string): Promise<ResumeSessionResponse> {
  return apiFetch<ResumeSessionResponse>(`/api/uploads/${sessionId}/resume`, {
    method: "GET",
  });
}
