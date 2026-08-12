import { DownloadView } from "./DownloadView";
import { FileInfoResponse } from "@/types/upload";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

async function fetchFileInfo(fileId: string): Promise<{ file: FileInfoResponse | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}/api/files/${fileId}`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok || !body.success) {
      return { file: null, error: body?.error?.message ?? "This file is no longer available." };
    }
    return { file: body.data as FileInfoResponse, error: null };
  } catch {
    return { file: null, error: "Couldn't reach the server. Please try again." };
  }
}

export default async function FilePage({ params }: { params: { fileId: string } }) {
  const { file, error } = await fetchFileInfo(params.fileId);
  return <DownloadView file={file} error={error} />;
}
