import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { FileModel } from "@/models/File.model";
import { DownloadEventModel } from "@/models/DownloadEvent.model";
import { ApiError, ok } from "@/utils/apiResponse";
import { storage } from "@/services/storage.service";
import { logger } from "@/utils/logger";

/** GET /api/files/:fileId — public metadata for the share/download page */
export async function getFileInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const file = await FileModel.findOne({ fileId: req.params.fileId });
    if (!file || file.status !== "active") {
      throw new ApiError(404, "FILE_NOT_FOUND", "This file is no longer available.");
    }
    if (file.expiresAt < new Date()) {
      throw new ApiError(410, "FILE_EXPIRED", "This file has expired.");
    }
    if (file.downloadLimit !== null && file.downloadCount >= file.downloadLimit) {
      throw new ApiError(410, "DOWNLOAD_LIMIT_REACHED", "This download link is no longer available.");
    }

    return ok(res, {
      fileId: file.fileId,
      fileName: file.originalName,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      expiresAt: file.expiresAt,
      downloadLimit: file.downloadLimit,
      downloadCount: file.downloadCount,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:fileId/download — generate a short-lived presigned URL.
 *
 * The download-count increment happens atomically and BEFORE the presigned
 * URL is handed out, using a findOneAndUpdate filter that re-checks the
 * limit server-side. This closes the race window where two concurrent
 * requests for a one-time-download link could otherwise both succeed.
 */
export async function generateDownload(req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();

    // Atomic conditional increment: only succeeds if still active, not expired,
    // and under the download limit (or unlimited).
    const file = await FileModel.findOneAndUpdate(
      {
        fileId: req.params.fileId,
        status: "active",
        expiresAt: { $gt: now },
        $or: [{ downloadLimit: null }, { $expr: { $lt: ["$downloadCount", "$downloadLimit"] } }],
      },
      { $inc: { downloadCount: 1 } },
      { new: true }
    );

    if (!file) {
      // Distinguish "doesn't exist" from "exists but blocked" for a clearer error,
      // without leaking whether a limit-reached file still technically exists.
      const existing = await FileModel.findOne({ fileId: req.params.fileId });
      if (!existing || existing.status !== "active") {
        throw new ApiError(404, "FILE_NOT_FOUND", "This file is no longer available.");
      }
      if (existing.expiresAt < now) {
        throw new ApiError(410, "FILE_EXPIRED", "This file has expired.");
      }
      throw new ApiError(410, "DOWNLOAD_LIMIT_REACHED", "This download link is no longer available.");
    }

    const presignedUrl = await storage.presignDownloadUrl(file.storageKey, file.sanitizedName);

    if (file.downloadLimit !== null && file.downloadCount >= file.downloadLimit) {
      file.status = "exhausted";
      await file.save();
    }

    const { DownloadSessionModel } = await import("@/models/DownloadSession.model");
    const { generateSessionId } = await import("@/utils/ids");
    const sessionId = generateSessionId();
    await DownloadSessionModel.create({
      sessionId,
      fileId: file._id,
      leaseUntil: new Date(Date.now() + 5 * 60 * 1000), // 5 minute grace
      status: "active",
    });

    const ipHash = crypto.createHash("sha256").update(req.ip ?? "unknown").digest("hex");
    await DownloadEventModel.create({
      fileId: file._id,
      ipHash,
      userAgent: req.get("user-agent") ?? "",
    });

    logger.info({ fileId: file.fileId, downloadSessionId: sessionId }, "Download URL issued and session started");

    return ok(res, { downloadUrl: presignedUrl, fileName: file.originalName, sessionId });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/files/:fileId — owner-initiated early delete */
export async function deleteFile(req: Request, res: Response, next: NextFunction) {
  try {
    const possessionToken = req.headers["x-possession-token"];
    if (!possessionToken || typeof possessionToken !== "string") {
      throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid possession token.");
    }

    const file = await FileModel.findOneAndUpdate(
      { fileId: req.params.fileId, status: "active", possessionToken },
      { $set: { status: "deleted" } },
      { new: true }
    );
    if (!file) throw new ApiError(404, "FILE_NOT_FOUND", "This file is no longer available.");

    await storage.deleteObject(file.storageKey).catch((err) => {
      logger.error({ err, fileId: file.fileId }, "Failed to delete storage object");
    });

    const { releaseActiveStorage } = await import("@/services/storageReservation.service");
    await releaseActiveStorage(file.sizeBytes);

    return ok(res, { fileId: file.fileId, status: "deleted" });
  } catch (err) {
    next(err);
  }
}

/** POST /api/downloads/:sessionId/heartbeat — extend the download lease */
export async function downloadHeartbeat(req: Request, res: Response, next: NextFunction) {
  try {
    const { DownloadSessionModel } = await import("@/models/DownloadSession.model");
    const session = await DownloadSessionModel.findOneAndUpdate(
      { sessionId: req.params.sessionId, status: "active" },
      { $set: { leaseUntil: new Date(Date.now() + 5 * 60 * 1000) } },
      { new: true }
    );
    if (!session) {
      throw new ApiError(404, "SESSION_NOT_FOUND", "Active download session not found.");
    }
    return ok(res, { status: "active", leaseUntil: session.leaseUntil });
  } catch (err) {
    next(err);
  }
}
