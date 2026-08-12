# Architecture

## Overview

```
Browser  ──────────►  Express API  ──────────►  MongoDB
   │                        │                  (metadata only)
   │                        │
   │                        ▼
   │                 Cloudflare R2 (presigned URLs issued here)
   │
   └────────────── direct upload/download ───────────────►  Cloudflare R2
```

File **bytes never pass through Express**. The API's job is auth/validation,
storage bookkeeping, and issuing short-lived presigned R2 URLs. The browser
uses those URLs to talk to R2 directly for both upload and download.

## Why this shape

- **10GB files through a Node process would be slow, memory-heavy, and fragile.**
  Direct-to-R2 multipart upload sidesteps that entirely — Express only ever
  handles small JSON payloads.
- **MongoDB never stores file bytes.** Only metadata (`File`, `UploadSession`,
  `StorageReservation`, `DownloadEvent`).

## Storage reservation (the trickiest part)

There's a global cap on active storage (`MAX_ACTIVE_STORAGE`). Two uploads
starting at the same instant must not both be admitted if together they'd
exceed the cap. This is solved with a **single-document atomic ledger**
(`StorageLedger`, `_id: "singleton"`), updated via MongoDB's
aggregation-pipeline form of `findOneAndUpdate`:

```js
StorageLedgerModel.findOneAndUpdate(
  { _id: "singleton" },
  [{ $set: { reservedBytes: { $cond: [
    { $lte: [{ $add: ["$activeBytes", "$reservedBytes", bytes] }, cap] },
    { $add: ["$reservedBytes", bytes] },
    "$reservedBytes",
  ] } } }],
  { new: true }
);
```

Because MongoDB applies the filter-evaluate-and-update as one atomic
operation per document, there's no read-then-write gap for a second request
to slip through. See `backend/src/services/storageReservation.service.ts`
and `backend/src/tests/storageReservation.test.ts` (which fires 20
concurrent reservations against an 8GB window and asserts exactly 8 succeed).

Reservation lifecycle: `reserved` → `committed` (upload succeeded, moves
bytes from `reservedBytes` to `activeBytes`) or `released` (upload
failed/aborted/expired, frees `reservedBytes`). Both transitions are
idempotent no-ops if called twice.

## Upload flow

1. `POST /api/uploads/session` — validate input, reserve storage, create an
   R2 multipart upload, presign all part URLs, persist an `UploadSession`.
2. Browser uploads each part directly to R2 via the presigned URLs
   (`hooks/useFileUpload.ts` — concurrency pool of 4, retry with backoff).
3. `POST /api/uploads/complete` — finalize the R2 multipart upload, create
   the `File` document, commit the reservation.
4. `POST /api/uploads/abort` — used on cancel/failure to abort the R2
   multipart upload and release the reservation.

## Download flow

`POST /api/files/:fileId/download` does an atomic conditional increment
(`findOneAndUpdate` with the download-limit check baked into the filter) so
a one-time-download link can't be raced past its limit by two concurrent
requests. It then issues a short-lived presigned GET URL.

## Cleanup

A cron job (`backend/src/jobs/cleanup.job.ts`, every 5 minutes) does three
idempotent sweeps: expire overdue files (delete R2 object → release active
storage → mark expired), abort abandoned upload sessions (stale >2h),
and reclaim reservations that outlived their TTL without being
committed/released.

## Deliberate scope limits

- No user accounts/auth — the PRD only requires `User` "if required," and
  nothing else in the spec depends on it, so it was omitted to avoid
  overengineering (per PRD §31).
- No QR code generation on the share page — flagged as an open item rather
  than half-implemented; see `docs/DEVELOPMENT.md`.
