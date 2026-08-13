# Backblaze B2 Integration Report

I have successfully replaced the `MockStorageService` with a real `B2StorageService` using the AWS SDK v3. The integration leverages the Backblaze B2 S3-compatible API to perform browser-direct, multipart uploads ensuring the Express backend is entirely bypassed for file uploads.

## 1. Files Created
- `backend/src/services/b2-storage.service.ts` - The core B2 S3 integration implementing `IStorageService`.
- `backend/test-b2.ts` - A local script to verify B2 credentials before production deployment.

## 2. Files Modified
- `backend/src/config/env.ts` - Removed R2 dependencies and added safe runtime checks for `B2_` variables.
- `backend/src/services/storage.service.ts` - Conditionally loads `B2StorageService` when `NODE_ENV=production`.
- `backend/src/server.ts` - Bound Express to `0.0.0.0` for safe deployment on Render.
- `.env.example` - Updated with `B2_` placeholders to guide configuration.

## 3. NPM Packages Installed
- `@aws-sdk/client-s3` - Official client for S3-compatible APIs.
- `@aws-sdk/s3-request-presigner` - Official utility for generating presigned URLs (for uploads and downloads).

## 4. Environment Variables Required
To use this integration, the backend requires the following variables:
- `B2_KEY_ID` (Your Backblaze key ID)
- `B2_APPLICATION_KEY` (Your Backblaze application secret)
- `B2_BUCKET_NAME` (e.g. `FileDrop`)
- `B2_ENDPOINT` (e.g. `s3.us-west-004.backblazeb2.com` — the region is extracted automatically)

## 5. Storage Architecture
The backend strictly uses the B2 S3 Compatibility API with **Path-Style** addressing. 
The system continues using the `StorageReservation` service in MongoDB to prevent uploads from exceeding configured application limits independently of B2 limits.

## 6. Multipart Upload Implementation
**10GB Upload Pipeline Preserved:**
1. Browser requests upload session.
2. Backend generates `CreateMultipartUploadCommand` on B2 and receives a native `uploadId`.
3. Backend generates multiple `UploadPartCommand` presigned URLs (16MB parts).
4. Browser uses `uploadPartWithProgress` to PUT directly to B2, bypassing Express.
5. Backend calls `CompleteMultipartUploadCommand` with all ETags to assemble the file.

## 7. Download Implementation
Using `GetObjectCommand`, the backend presigns temporary GET URLs.
The bucket remains **100% PRIVATE**. No files are accessible without generating a 15-minute token via the FileDrop API. The system verifies expiration, increments the download limit atomically in MongoDB, and serves the B2 URL.

## 8. Delete & 9. Cleanup Implementation
When a file naturally expires or exhausts limits, the MongoDB Cron Job executes `storage.deleteObject()`, issuing a `DeleteObjectCommand` directly to B2 to physically destroy the payload. Aborted uploads trigger `AbortMultipartUploadCommand` to destroy dangling B2 chunks.

## 10. CORS Configuration Requirements
Because the frontend (`file-drop-frontend-lovat.vercel.app`) communicates directly with the B2 bucket for uploads, **you must configure CORS on the Backblaze Dashboard**.

Add this CORS Rule in B2 for your bucket:
- **Share Rules to All (or Specific Origin):** `https://file-drop-frontend-lovat.vercel.app`
- **Allowed Operations (Methods):** `GET`, `PUT`, `POST`, `HEAD`
- **Allowed Headers:** `*`
- **Expose Headers:** `ETag` (CRITICAL: if you miss this, multipart uploads will fail because the frontend won't be able to read the ETag!).
- **Max Age:** `86400`

## 11. Security Audit Result
- All B2 keys are locked in the Express backend environment.
- No `NEXT_PUBLIC_` variables contain secrets.
- Download limits decrement atomically using Mongoose `$inc`.
- Download URLs are temporary and hide internal storage identifiers.

## 12-14. Test Results
- **Backend Tests:** Passed (Vitest ran successfully verifying reservations).
- **Frontend Build:** Passed (Turbopack + Tailwind v4 built statically).
- **Real B2 Test:** Ran `test-b2.ts` and successfully threw the expected assertion error: `Backblaze B2 is not configured. Missing: b2KeyId, b2ApplicationKey, b2Endpoint.`. You can run `npx tsx test-b2.ts` in the backend folder once you populate your local `.env`.

## 16. Exact Render Environment Variables (Backend)
When deploying the Express app to Render, configure:
- `NODE_ENV` = `production`
- `PORT` = `5000` (Render overrides this automatically, but safe to set)
- `MONGODB_URI` = `mongodb+srv://...`
- `FRONTEND_ORIGIN` = `https://file-drop-frontend-lovat.vercel.app`
- `B2_KEY_ID` = `(Your ID)`
- `B2_APPLICATION_KEY` = `(Your Key)`
- `B2_BUCKET_NAME` = `FileDrop`
- `B2_ENDPOINT` = `(Your Endpoint)`

## 17. Exact Vercel Environment Variables (Frontend)
When deploying the Next.js app to Vercel, configure:
- `NEXT_PUBLIC_API_URL` = `https://your-render-backend-url.onrender.com`
