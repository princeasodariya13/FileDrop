# Storage Provider Requirements

This document outlines the strict technical capabilities required of any cloud storage provider being considered for integration into FileDrop. 

## Storage Interface

Any integrated provider must fully implement the existing `IStorageService` abstraction defined in `backend/src/services/storage.service.ts`:

1. `createMultipartUpload(key, contentType)`: Initiates a multipart upload and returns a provider-specific `uploadId`.
2. `presignUploadParts(key, uploadId, totalParts)`: Generates an array of presigned HTTP PUT URLs, one for each file chunk.
3. `completeMultipartUpload(key, uploadId, parts)`: Assembles the file using the ETags returned by the provider during the chunk uploads.
4. `abortMultipartUpload(key, uploadId)`: Cancels the upload and deletes any orphaned chunks.
5. `objectExists(key)`: Verifies if a file is fully assembled and accessible.
6. `deleteObject(key)`: Permanently deletes the object from the bucket.
7. `presignDownloadUrl(key, downloadFilename)`: Generates a temporary, secure HTTP GET URL for direct file download.

## Upload Architecture

To bypass Node.js/Express memory and bandwidth limitations, 10GB files **never pass through the backend**.
1. The backend authorizes the upload and calls `createMultipartUpload` to generate a session.
2. The browser requests presigned URLs for its 5MB-20MB chunks.
3. The browser uses `XMLHttpRequest` or `fetch` to execute HTTP PUTs **directly** against the storage provider's presigned URLs.
4. The provider responds with `ETag` headers for each chunk.
5. The browser submits the collected `ETags` to the backend, which finalizes the object via `completeMultipartUpload`.

## Download Architecture

Downloads are heavily gated by backend authorization (download limits, expiration, possession checks). 
1. The user requests a download via the backend.
2. The backend increments the download counter atomically.
3. If authorized, the backend calls `presignDownloadUrl` and returns the URL.
4. The browser directly downloads the bytes from the storage provider.
*Note: The provider must support appending `Content-Disposition: attachment; filename="..."` to the presigned URL so the browser downloads the file properly instead of trying to render it.*

## Cleanup Architecture

FileDrop does not permanently store user files.
- **Expired/Exhausted Files:** A cron job running in the backend sweeps the MongoDB database every 5 minutes. If a file has expired or hit its download limit, the backend calls `deleteObject(key)`.
- **Abandoned Uploads:** If a user closes the browser mid-upload, the cron job detects the stale session and calls `abortMultipartUpload(key, uploadId)` to ensure orphaned chunks don't incur storage costs.

## Provider Requirements

To replace the `MockStorageService`, the chosen cloud provider **must** support:

1. **Large Objects:** Support individual objects up to at least **10 GB**.
2. **S3 Multipart Upload API:** Must natively support chunked multipart uploads (Init, Upload Part, Complete, Abort).
3. **Presigned URLs:** Must support signing both standard GET requests (for download) and individual Multipart PUT requests (for upload).
4. **CORS Configuration:** Must allow configuring Cross-Origin Resource Sharing so the browser can execute PUT requests directly to the bucket and read the `ETag` response header.
5. **No API Gateway Limits:** The provider's presigned URL ingestion layer must not forcefully timeout or buffer large chunks that cause bottlenecks.
6. **Concurrent High Availability:** Natively handle hundreds of simultaneous direct-to-bucket connections.
7. **S3 Compatibility (Recommended):** An S3-compatible API (like AWS S3, Cloudflare R2, or Backblaze B2) is strongly preferred as it allows the use of the standard `@aws-sdk/client-s3` library, preventing vendor lock-in and minimizing custom implementation overhead.
