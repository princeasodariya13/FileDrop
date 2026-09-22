import type { Metadata } from "next";
import { DownloadView } from "./DownloadView";
import { FileInfoResponse } from "@/types/upload";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

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

export async function generateMetadata({ params }: { params: Promise<{ fileId: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const { file } = await fetchFileInfo(resolvedParams.fileId);

  return {
    title: file ? `Download ${file.fileName}` : "Download Shared File",
    description: "Download shared file securely on FileDrop online file transfer service.",
    robots: {
      index: false,
      follow: false,
      noimageindex: true,
      nocache: true,
    },
  };
}

export default async function FilePage({ params }: { params: Promise<{ fileId: string }> }) {
  const resolvedParams = await params;
  const { file, error } = await fetchFileInfo(resolvedParams.fileId);
  return <DownloadView file={file} error={error} />;
}
