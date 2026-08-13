import { apiFetch } from "./client";
import { FileInfoResponse } from "@/types/upload";

export async function getFileInfo(fileId: string): Promise<FileInfoResponse> {
  return apiFetch<FileInfoResponse>(`/api/files/${fileId}`);
}

export async function deleteFileEarly(fileId: string, possessionToken: string) {
  return apiFetch(`/api/files/${fileId}`, {
    method: "DELETE",
    headers: { "x-possession-token": possessionToken },
  });
}

export async function sendHeartbeat(sessionId: string) {
  return apiFetch(`/api/downloads/${sessionId}/heartbeat`, {
    method: "POST"
  });
}

export async function getDownloadUrl(fileId: string): Promise<{ downloadUrl: string; fileName: string; sessionId: string }> {
  return apiFetch(`/api/files/${fileId}/download`, { method: "POST" });
}
