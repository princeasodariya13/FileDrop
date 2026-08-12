import { Request, Response, NextFunction } from "express";
import { env } from "@/config/env";
import { ok, ApiError } from "@/utils/apiResponse";
import { sanitizeFilename, buildR2Key, generateFileId, generateSessionId } from "@/utils/ids";
import { createUploadSessionSchema, completeUploadSchema, abortUploadSchema } from "@/validators/upload.validator";
import { reserveStorage, commitReservation, releaseReservation } from "@/services/storageReservation.service";
import * as r2 from "@/services/r2.service";
import { UploadSessionModel } from "@/models/UploadSession.model";
import { FileModel } from "@/models/File.model";
import { logger } from "@/utils/logger";

/** POST /api/uploads/session — validate, reserve storage, create R2 multipart upload */
export async function createUploadSession(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createUploadSessionSchema.parse(req.body);

    const sanitizedName = sanitizeFilename(input.fileName);
    const fileId = generateFileId();
    const r2Key = buildR2Key(fileId, sanitizedName);

    // 1. Reserve storage atomically BEFORE talking to R2.
    const reservation = await reserveStorage(input.sizeBytes);

    try {
      // 2. Create the multipart upload on R2.
      const uploadId = await r2.createMultipartUpload(r2Key, input.mimeType);

      const partSize = env.multipartPartSizeBytes;
      const totalParts = Math.max(1, Math.ceil(input.sizeBytes / partSize));

      const session = await UploadSessionModel.create({
        sessionId: generateSessionId(),
        r2Key,
        r2UploadId: uploadId,
        originalName: input.fileName,
        sizeBytes: input.sizeBytes,
        mimeType: input.mimeType,
        partSizeBytes: partSize,
        totalParts,
        status: "uploading",
        reservationId: reservation._id,
        downloadLimit: input.downloadLimit ?? null,
        expirationHours: input.expirationHours ?? env.defaultExpirationHours,
        clientIp: req.ip ?? "unknown",
      });

      // 3. Presign URLs for every part up front (client uploads directly to R2).
      const parts = await r2.presignUploadParts(r2Key, uploadId, totalParts);

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
    const parts = await r2.presignUploadParts(session.r2Key, session.r2UploadId, session.totalParts);
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
      await r2.completeMultipartUpload(session.r2Key, session.r2UploadId, input.parts);
    } catch {
      session.status = "failed";
      await session.save();
      await releaseReservation(session.reservationId as never);
      throw new ApiError(502, "R2_COMPLETE_FAILED", "Failed to finalize the upload with storage. Your file was not saved.");
    }

    const fileId = session.r2Key.split("/")[1];
    const sanitizedName = sanitizeFilename(session.originalName);
    const expiresAt = new Date(Date.now() + session.expirationHours * 60 * 60 * 1000);

    const file = await FileModel.create({
      fileId,
      originalName: session.originalName,
      sanitizedName,
      sizeBytes: session.sizeBytes,
      mimeType: session.mimeType,
      r2Key: session.r2Key,
      status: "active",
      downloadLimit: session.downloadLimit,
      downloadCount: 0,
      expiresAt,
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
      shareUrl: `${req.protocol}://${req.get("host")}/file/${file.fileId}`,
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
      await r2.abortMultipartUpload(session.r2Key, session.r2UploadId).catch((err) => {
        logger.warn({ err, sessionId: session.sessionId }, "R2 abort failed (continuing cleanup)");
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
