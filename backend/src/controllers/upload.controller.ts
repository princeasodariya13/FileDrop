import { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { ok, ApiError } from "@/utils/apiResponse";
import { sanitizeFilename, buildStorageKey, generateFileId, generateSessionId, generateTransferCode } from "@/utils/ids";
import { createUploadSessionSchema, completeUploadSchema, abortUploadSchema, heartbeatUploadSchema } from "@/validators/upload.validator";
import { reserveStorage, commitReservation, releaseReservation } from "@/services/storageReservation.service";
import { storage } from "@/services/storage.service";
import crypto from "crypto";
import { UploadSessionModel } from "@/models/UploadSession.model";
import { FileModel } from "@/models/File.model";
import { logger } from "@/utils/logger";

/** POST /api/uploads/session — validate, reserve storage, create multipart upload */
export async function createUploadSession(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createUploadSessionSchema.parse(req.body);

    const sanitizedName = sanitizeFilename(input.fileName);
    const fileId = generateFileId();
    const storageKey = buildStorageKey(fileId, sanitizedName);

    const partSize = env.multipartPartSizeBytes;
    const totalParts = Math.max(1, Math.ceil(input.sizeBytes / partSize));

    // Run storage reservation and multipart upload creation concurrently.
    // They are independent: one is a DB atomic write, the other is an outbound
    // B2 API call. Running them in parallel halves this part of the latency.
    const [reservation, uploadId] = await Promise.all([
      reserveStorage(input.sizeBytes),
      storage.createMultipartUpload(storageKey, input.mimeType),
    ]);

    try {
      // Presign all part URLs and persist the session concurrently.
      // presignUploadParts now signs all URLs in parallel internally too.
      const [parts, session] = await Promise.all([
        storage.presignUploadParts(storageKey, uploadId, totalParts),
        UploadSessionModel.create({
          sessionId: generateSessionId(),
          storageKey,
          storageUploadId: uploadId,
          originalName: input.fileName,
          sizeBytes: input.sizeBytes,
          mimeType: input.mimeType,
          partSizeBytes: partSize,
          totalParts,
          status: "uploading",
          reservationId: reservation._id,
          downloadLimit: input.downloadLimit ?? null,
          expirationSeconds: input.expirationSeconds ?? 3600,
          clientIp: req.ip ?? "unknown",
        }),
      ]);

      logger.info({ sessionId: session.sessionId, sizeBytes: input.sizeBytes }, "Upload session created");

      return ok(res, {
        sessionId: session.sessionId,
        fileId,
        partSizeBytes: partSize,
        totalParts,
        parts,
      });
    } catch (err) {
      // Roll back the reservation if anything after it fails.
      await releaseReservation(reservation._id as never);
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

/** POST /api/uploads/:sessionId/parts/refresh — re-presign remaining parts (retry support) */
export async function refreshPartUrls(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await UploadSessionModel.findOne({ sessionId: req.params.sessionId });
    if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Upload session not found.");
    if (session.status !== "uploading") {
      throw new ApiError(409, "SESSION_NOT_ACTIVE", "This upload session is no longer active.");
    }
    const parts = await storage.presignUploadParts(session.storageKey, session.storageUploadId, session.totalParts);
    return ok(res, { parts });
  } catch (err) {
    next(err);
  }
}

/** POST /api/uploads/complete — finalize multipart upload, create File doc, commit reservation */
export async function completeUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const input = completeUploadSchema.parse(req.body);
    const session = await UploadSessionModel.findOne({ sessionId: input.sessionId });
    if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Upload session not found.");
    if (session.status !== "uploading") {
      throw new ApiError(409, "SESSION_NOT_ACTIVE", "This upload session cannot be completed.");
    }

    session.status = "completing";
    await session.save();

    try {
      await storage.completeMultipartUpload(session.storageKey, session.storageUploadId, input.parts);
    } catch {
      session.status = "failed";
      await session.save();
      await releaseReservation(session.reservationId as never);
      throw new ApiError(502, "STORAGE_COMPLETE_FAILED", "Failed to finalize the upload with storage. Your file was not saved.");
    }

    const fileId = session.storageKey.split("/")[1];
    const sanitizedName = sanitizeFilename(session.originalName);

    // Safely support new expirationSeconds and legacy expirationHours uploads.
    const durationMs = session.expirationSeconds
      ? session.expirationSeconds * 1000
      : (session.expirationHours ?? env.defaultExpirationHours) * 60 * 60 * 1000;

    const uploadedAt = new Date();
    const expiresAt = new Date(uploadedAt.getTime() + durationMs);

    const possessionToken = crypto.randomBytes(32).toString("hex");

    const requestedCode = (input.code as string | undefined)?.trim();
    const bundleId = (input.bundleId as string | undefined)?.trim();

    let file;
    if (requestedCode && /^\d{6}$/.test(requestedCode)) {
      file = await FileModel.create({
        fileId,
        code: requestedCode,
        bundleId,
        originalName: session.originalName,
        sanitizedName,
        sizeBytes: session.sizeBytes,
        mimeType: session.mimeType,
        storageKey: session.storageKey,
        possessionToken,
        status: "active",
        downloadLimit: session.downloadLimit,
        downloadCount: 0,
        expiresAt,
        inactivityTimerStartsAt: uploadedAt,
        reservationId: session.reservationId,
      });
    } else {
      let attempts = 0;
      while (attempts < 10) {
        const codeCandidate = generateTransferCode();
        const existing = await FileModel.findOne({ code: codeCandidate, status: "active", expiresAt: { $gt: new Date() } });
        if (existing) {
          attempts++;
          continue;
        }
        try {
          file = await FileModel.create({
            fileId,
            code: codeCandidate,
            bundleId,
            originalName: session.originalName,
            sanitizedName,
            sizeBytes: session.sizeBytes,
            mimeType: session.mimeType,
            storageKey: session.storageKey,
            possessionToken,
            status: "active",
            downloadLimit: session.downloadLimit,
            downloadCount: 0,
            expiresAt,
            inactivityTimerStartsAt: uploadedAt,
            reservationId: session.reservationId,
          });
          break;
        } catch (err: any) {
          if (err.code === 11000 && err.keyPattern?.code) {
            attempts++;
            continue;
          }
          throw err;
        }
      }
    }

    if (!file) {
      throw new ApiError(500, "CODE_GENERATION_FAILED", "Could not generate a unique transfer code. Please try again.");
    }

    await commitReservation(session.reservationId as never);

    session.status = "completed";
    await session.save();

    logger.info({ fileId, code: file.code, sizeBytes: file.sizeBytes }, "Upload completed with transfer code");

    return ok(res, {
      fileId: file.fileId,
      code: file.code,
      fileName: file.originalName,
      sizeBytes: file.sizeBytes,
      expiresAt: file.expiresAt,
      downloadLimit: file.downloadLimit,
      shareUrl: `${env.frontendOrigin}/file/${file.fileId}`,
      possessionToken,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/uploads/abort — cancel an in-progress upload and release its reservation */
export async function abortUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const input = abortUploadSchema.parse(req.body);
    const session = await UploadSessionModel.findOne({ sessionId: input.sessionId });
    if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Upload session not found.");

    if (session.status === "uploading" || session.status === "initializing") {
      const lockedSession = await UploadSessionModel.findOneAndUpdate(
        { _id: session._id, status: session.status, cleanupClaimedAt: session.cleanupClaimedAt },
        { $set: { cleanupClaimedAt: new Date() } },
        { new: true }
      );

      if (!lockedSession) {
        const current = await UploadSessionModel.findOne({ sessionId: input.sessionId });
        return ok(res, { sessionId: input.sessionId, status: current?.status ?? session.status });
      }

      try {
        await storage.abortMultipartUpload(lockedSession.storageKey, lockedSession.storageUploadId);
      } catch (err) {
        logger.warn({ err, sessionId: lockedSession.sessionId }, "Storage abort failed in cancellation");
        throw new ApiError(502, "STORAGE_ABORT_FAILED", "Failed to cancel upload in storage. It will be cleaned up automatically.");
      }

      await releaseReservation(lockedSession.reservationId as never);
      lockedSession.status = "aborted";
      await lockedSession.save();
      return ok(res, { sessionId: lockedSession.sessionId, status: lockedSession.status });
    }

    return ok(res, { sessionId: session.sessionId, status: session.status });
  } catch (err) {
    next(err);
  }
}

/** POST /api/uploads/heartbeat — keeps the upload alive so it's not swept by cleanup */
export async function heartbeatUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const input = heartbeatUploadSchema.parse(req.body);
    const session = await UploadSessionModel.findOneAndUpdate(
      {
        sessionId: input.sessionId,
        status: { $in: ["initializing", "uploading", "completing"] }
      },
      { $set: { lastUploadActivityAt: new Date() } },
      { new: true }
    );

    if (!session) {
      // Return 404 or just 200? The user may have been disconnected and session was cleaned.
      // If we throw, the frontend might stop. We should probably return 200 with an indicator, or throw 404.
      // A 404 is appropriate if it's genuinely gone/aborted.
      throw new ApiError(404, "SESSION_NOT_FOUND", "Upload session is no longer active or not found.");
    }

    return ok(res, { success: true });
  } catch (err) {
    next(err);
  }
}

/** GET /api/uploads/:sessionId/resume — Fetch session metadata and uploaded parts for cross-refresh resume */
export async function resumeUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      throw new ApiError(400, "INVALID_SESSION_ID", "Session ID is required.");
    }

    const session = await UploadSessionModel.findOne({ sessionId });

    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", "Upload session not found.");
    }

    if (session.status === "completed") {
      throw new ApiError(409, "SESSION_COMPLETED", "This upload session has already been completed.");
    }

    if (["aborted", "failed"].includes(session.status)) {
      throw new ApiError(409, "SESSION_ABORTED", "This upload session was aborted or failed.");
    }

    if (session.cleanupClaimedAt) {
      throw new ApiError(409, "SESSION_CLEANED", "This upload session has expired and was cleaned up.");
    }

    // A session is allowed to resume if it's "uploading", "initializing", or "completing".
    // "completing" means the client previously sent completeUpload but refreshed before getting the response,
    // or it failed. We allow them to resume, fetch parts, and they can attempt completeUpload again.

    // Fetch the list of parts already safely stored in B2
    const parts = await storage.listMultipartUploadParts(session.storageKey, session.storageUploadId);

    return ok(res, {
      sessionId: session.sessionId,
      status: session.status,
      fileName: session.originalName,
      sizeBytes: session.sizeBytes,
      mimeType: session.mimeType,
      partSizeBytes: session.partSizeBytes,
      totalParts: session.totalParts,
      parts,
    });
  } catch (err) {
    next(err);
  }
}
