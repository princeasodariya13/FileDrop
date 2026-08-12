import { apiFetch } from "./client";
import { FileInfoResponse } from "@/types/upload";

export async function getFileInfo(fileId: string): Promise<FileInfoResponse> {
  return apiFetch<FileInfoResponse>(`/api/files/${fileId}`);
}

export async function getDownloadUrl(fileId: string): Promise<{ downloadUrl: string; fileName: string }> {
  return apiFetch(`/api/files/${fileId}/download`, { method: "POST" });
}
