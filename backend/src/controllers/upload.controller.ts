import { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { ok, ApiError } from "@/utils/apiResponse";
import { sanitizeFilename, buildStorageKey, generateFileId, generateSessionId } from "@/utils/ids";
import { createUploadSessionSchema, completeUploadSchema, abortUploadSchema } from "@/validators/upload.validator";
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

    // 1. Reserve storage atomically BEFORE talking to the storage provider.
    const reservation = await reserveStorage(input.sizeBytes);

    try {
      // 2. Create the multipart upload on storage.
      const uploadId = await storage.createMultipartUpload(storageKey, input.mimeType);

      const partSize = env.multipartPartSizeBytes;
      const totalParts = Math.max(1, Math.ceil(input.sizeBytes / partSize));

      const session = await UploadSessionModel.create({
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
        expirationSeconds: input.expirationSeconds ?? 3600, // default 1 hour
        clientIp: req.ip ?? "unknown",
      });

      // 3. Presign URLs for every part up front (client uploads directly to storage).
      const parts = await storage.presignUploadParts(storageKey, uploadId, totalParts);

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

    const file = await FileModel.create({
      fileId,
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

    await commitReservation(session.reservationId as never);

    session.status = "completed";
    await session.save();

    logger.info({ fileId, sizeBytes: file.sizeBytes }, "Upload completed");

    return ok(res, {
      fileId: file.fileId,
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
      await storage.abortMultipartUpload(session.storageKey, session.storageUploadId).catch((err) => {
        logger.warn({ err, sessionId: session.sessionId }, "Storage abort failed (continuing cleanup)");
      });
      await releaseReservation(session.reservationId as never);
      session.status = "aborted";
      await session.save();
    }

    return ok(res, { sessionId: session.sessionId, status: session.status });
  } catch (err) {
    next(err);
  }
}
