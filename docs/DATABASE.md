# Database

MongoDB via Mongoose. No file bytes are ever stored here — only metadata.

## `File` (`backend/src/models/File.model.ts`)
| Field | Type | Notes |
|---|---|---|
| `fileId` | string | public, URL-safe, unique, indexed |
| `originalName` / `sanitizedName` | string | |
| `sizeBytes` | number | |
| `r2Key` | string | unique |
| `status` | `active \| expired \| deleted` | indexed |
| `downloadLimit` | number \| null | null = unlimited |
| `downloadCount` | number | incremented atomically on download |
| `expiresAt` | Date | indexed (compound with `status`) for cleanup queries |
| `reservationId` | ObjectId ref | |

## `UploadSession` (`UploadSession.model.ts`)
Tracks one in-flight multipart upload: `sessionId`, `r2Key`, `r2UploadId`,
`partSizeBytes`, `totalParts`, `status` (`initializing → uploading →
completing → completed | aborted | failed`), `reservationId`,
`downloadLimit`, `expirationHours`. Indexed on `(status, updatedAt)` so the
cleanup job can cheaply find stale sessions.

## `StorageReservation` + `StorageLedger` (`StorageReservation.model.ts`)
- `StorageReservation`: one row per reservation, `bytesReserved`, `status`
  (`reserved | committed | released`), `expiresAt` — the audit trail.
- `StorageLedger`: a **singleton** document (`_id: "singleton"`) holding the
  atomic counters `activeBytes` / `reservedBytes`. All capacity math goes
  through this one document so MongoDB's per-document atomicity guarantees
  no overshoot under concurrent requests. See `docs/ARCHITECTURE.md`.

## `DownloadEvent` (`DownloadEvent.model.ts`)
One row per successful download: `fileId` ref, `ipHash` (SHA-256 of the
requester's IP — raw IPs are never stored), `userAgent`, `createdAt`.

## Indexing rationale

- `File.fileId` — unique lookup on every `GET /api/files/:fileId` and
  download request.
- `File.{status, expiresAt}` — the cleanup job's "find overdue active
  files" query.
- `UploadSession.{status, updatedAt}` — the cleanup job's "find abandoned
  sessions" query.
- `StorageReservation.{status, expiresAt}` — the cleanup job's "find
  expired reservations" query.

## Why no native MongoDB TTL indexes

Expiration deletes an R2 object and updates the ledger *before* the Mongo
document should disappear. A native TTL index deletes the document straight
away with no hook for that side effect, so expiration is handled by the
cron job instead (`backend/src/jobs/cleanup.job.ts`), which only flips
`status` after the R2 delete succeeds.
