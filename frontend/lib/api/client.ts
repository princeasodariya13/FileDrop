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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
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
