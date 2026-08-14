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
  let receiverId = undefined;
  if (typeof window !== "undefined") {
    try {
      receiverId = localStorage.getItem("filedrop_receiver_id") || undefined;
    } catch {}
  }

  const response = await apiFetch<{ downloadUrl: string; fileName: string; sessionId: string; receiverId?: string }>(
    `/api/files/${fileId}/download`,
    {
      method: "POST",
      body: JSON.stringify({ receiverId })
    }
  );

  if (typeof window !== "undefined" && response.receiverId) {
    try {
      localStorage.setItem("filedrop_receiver_id", response.receiverId);
    } catch {}
  }

  return response;
}
