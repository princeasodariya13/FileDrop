export type UploadStatus =
  | "idle"
  | "validating"
  | "reserving"
  | "initializing"
  | "uploading"
  | "paused"
  | "completing"
  | "success"
  | "failed"
  | "cancelled"
  | "expired";

export interface UploadPart {
  partNumber: number;
  presignedUrl: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  fileId: string;
  partSizeBytes: number;
  totalParts: number;
  parts: UploadPart[];
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface CompleteUploadResponse {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  expiresAt: string;
  downloadLimit: number | null;
  shareUrl: string;
  possessionToken: string;
}

export interface FileInfoResponse {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  expiresAt: string;
  downloadLimit: number | null;
  downloadCount: number;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string };
}

export interface UploadOptions {
  expirationSeconds: number;
  downloadLimit: number | null;
}

export interface UploadProgressState {
  status: UploadStatus;
  bytesUploaded: number;
  totalBytes: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  errorMessage: string | null;
  result: CompleteUploadResponse | null;
}
