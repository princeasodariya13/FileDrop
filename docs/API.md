# API Reference

Base URL: `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:5000`)

All responses follow:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "FILE_EXPIRED", "message": "This file has expired." } }
```

## Uploads

### `POST /api/uploads/session`
Rate limited (`RATE_LIMIT_UPLOAD_PER_HOUR`). Reserves storage and creates an
R2 multipart upload.

Body:
```json
{
  "fileName": "video.mp4",
  "sizeBytes": 4294967296,
  "mimeType": "video/mp4",
  "expirationHours": 24,
  "downloadLimit": null
}
```
Response `data`: `{ sessionId, fileId, partSizeBytes, totalParts, parts: [{ partNumber, presignedUrl }] }`

Errors: `400 VALIDATION_ERROR`, `507 STORAGE_FULL`, `429 RATE_LIMITED`

### `POST /api/uploads/:sessionId/parts/refresh`
Re-presigns all part URLs (presigned URLs expire after `PRESIGNED_URL_TTL_SECONDS`;
call this if a large upload runs long enough for URLs to go stale).

### `POST /api/uploads/complete`
Body: `{ sessionId, parts: [{ partNumber, etag }] }`
Finalizes the R2 multipart upload, creates the `File` record, commits the
storage reservation.
Response `data`: `{ fileId, fileName, sizeBytes, expiresAt, downloadLimit, shareUrl }`

### `POST /api/uploads/abort`
Body: `{ sessionId }`. Aborts the R2 multipart upload and releases the
reservation. Used on cancel or unrecoverable part failure.

## Files

### `GET /api/files/:fileId`
Public metadata for the download page.
Response `data`: `{ fileId, fileName, sizeBytes, mimeType, expiresAt, downloadLimit, downloadCount }`
Errors: `404 FILE_NOT_FOUND`, `410 FILE_EXPIRED`, `410 DOWNLOAD_LIMIT_REACHED`

### `POST /api/files/:fileId/download`
Rate limited (`RATE_LIMIT_DOWNLOAD_PER_HOUR`). Atomically increments the
download counter (subject to the limit) and issues a short-lived presigned
GET URL.
Response `data`: `{ downloadUrl, fileName }`

### `DELETE /api/files/:fileId`
Owner-initiated early delete. Deletes the R2 object and releases active
storage.

## Storage

### `GET /api/storage/status`
Response `data`: `{ activeBytes, reservedBytes, availableBytes, capacityBytes }`
Used by the frontend to preemptively warn when storage is full.

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body failed schema validation |
| `STORAGE_FULL` | 507 | Not enough available storage right now |
| `SESSION_NOT_FOUND` | 404 | Upload session doesn't exist |
| `SESSION_NOT_ACTIVE` | 409 | Session already completed/aborted/failed |
| `R2_COMPLETE_FAILED` | 502 | R2 rejected the multipart completion |
| `FILE_NOT_FOUND` | 404 | File doesn't exist or was deleted |
| `FILE_EXPIRED` | 410 | File's expiration has passed |
| `DOWNLOAD_LIMIT_REACHED` | 410 | Download limit already used up |
| `RATE_LIMITED` | 429 | Too many requests from this IP |
| `INTERNAL_ERROR` | 500 | Unexpected server error (no internal detail leaked) |
