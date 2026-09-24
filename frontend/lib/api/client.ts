const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export class ApiRequestError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getReceiverId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem("filedrop_receiver_id");
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "rec_" + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem("filedrop_receiver_id", id);
    }
    return id;
  } catch {
    return "";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const receiverId = getReceiverId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(receiverId ? { "x-receiver-id": receiverId } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.success) {
    const code = body?.error?.code ?? "UNKNOWN_ERROR";
    const message = body?.error?.message ?? "Something went wrong. Please try again.";
    throw new ApiRequestError(res.status, code, message);
  }

  return body.data as T;
}

/** Uploads a single part directly to R2 with progress tracking, via XHR (fetch has no upload progress event). */
export function uploadPartWithProgress(
  presignedUrl: string,
  blob: Blob,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presignedUrl, true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) {
          reject(new Error("Upload succeeded but no ETag was returned by storage."));
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`Part upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error while uploading part."));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.send(blob);
  });
}
