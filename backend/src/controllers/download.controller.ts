import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { FileModel } from "@/models/File.model";
import { DownloadEventModel } from "@/models/DownloadEvent.model";
import { ApiError, ok } from "@/utils/apiResponse";
import { storage } from "@/services/storage.service";
import { logger } from "@/utils/logger";

function extractReceiverId(req: Request): string | null {
  const header = req.headers["x-receiver-id"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const bodyId = req.body?.receiverId;
  if (typeof bodyId === "string" && bodyId.trim()) return bodyId.trim();
  const queryId = req.query?.receiverId;
  if (typeof queryId === "string" && queryId.trim()) return queryId.trim();
  return null;
}

async function claimOrVerifyReceiverSlot(file: InstanceType<typeof FileModel>, receiverId: string | null): Promise<InstanceType<typeof FileModel>> {
  if (file.downloadLimit === null) {
    return file;
  }

  const now = new Date();
  const totalOccupiedSlots = file.downloadCount + file.receiverIds.length;

  if (receiverId) {
    const isAlreadyReceiver = file.receiverIds.includes(receiverId);
    if (isAlreadyReceiver) {
      return file;
    }

    if (totalOccupiedSlots >= file.downloadLimit) {
      throw new ApiError(
        410,
        "DOWNLOAD_LIMIT_REACHED",
        `This file code has reached its maximum system sharing limit (${file.downloadLimit} system${file.downloadLimit > 1 ? "s" : ""}).`
      );
    }

    const updatedFile = (await FileModel.findOneAndUpdate(
      {
        _id: file._id,
        status: "active",
        expiresAt: { $gt: now },
        $expr: { $lt: [{ $add: ["$downloadCount", { $size: "$receiverIds" }] }, "$downloadLimit"] },
      },
      { $addToSet: { receiverIds: receiverId } },
      { new: true }
    )) as InstanceType<typeof FileModel>;

    if (!updatedFile) {
      throw new ApiError(
        410,
        "DOWNLOAD_LIMIT_REACHED",
        `This file code has reached its maximum system sharing limit (${file.downloadLimit} system${file.downloadLimit > 1 ? "s" : ""}).`
      );
    }

    return updatedFile;
  } else {
    if (totalOccupiedSlots >= file.downloadLimit) {
      throw new ApiError(
        410,
        "DOWNLOAD_LIMIT_REACHED",
        `This file code has reached its maximum system sharing limit (${file.downloadLimit} system${file.downloadLimit > 1 ? "s" : ""}).`
      );
    }
    return file;
  }
}

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

    const receiverId = extractReceiverId(req);
    const verifiedFile = await claimOrVerifyReceiverSlot(file, receiverId);

    return ok(res, {
      fileId: verifiedFile.fileId,
      code: verifiedFile.code,
      fileName: verifiedFile.originalName,
      sizeBytes: verifiedFile.sizeBytes,
      mimeType: verifiedFile.mimeType,
      expiresAt: verifiedFile.expiresAt,
      downloadLimit: verifiedFile.downloadLimit,
      downloadCount: verifiedFile.downloadCount + verifiedFile.receiverIds.length,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/files/code/:code — lookup file metadata using 6-digit transfer code */
export async function getFileInfoByCode(req: Request, res: Response, next: NextFunction) {
  try {
    const rawCode = req.params.code;
    if (!rawCode || typeof rawCode !== "string" || !/^\d{6}$/.test(rawCode.trim())) {
      throw new ApiError(400, "INVALID_CODE", "Please enter a valid 6-digit code.");
    }

    const code = rawCode.trim();
    const now = new Date();

    const files = await FileModel.find({ code });

    if (!files || files.length === 0) {
      throw new ApiError(404, "INCORRECT_CODE", "Incorrect 6-digit code. Please check your code and try again.");
    }

    const activeFiles = files.filter((f) => f.status === "active" && f.expiresAt > now);
    if (activeFiles.length === 0) {
      throw new ApiError(410, "FILE_EXPIRED", "This 6-digit transfer code has expired.");
    }

    const receiverId = extractReceiverId(req);
    const verifiedFiles: Array<InstanceType<typeof FileModel>> = [];
    for (const f of activeFiles) {
      const verified = await claimOrVerifyReceiverSlot(f, receiverId);
      verifiedFiles.push(verified);
    }

    const fileList = verifiedFiles.map((file) => ({
      fileId: file.fileId,
      code: file.code,
      fileName: file.originalName,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      expiresAt: file.expiresAt,
      downloadLimit: file.downloadLimit,
      downloadCount: file.downloadCount + file.receiverIds.length,
    }));

    const primary = fileList[0];
    return ok(res, {
      ...primary,
      files: fileList,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:fileId/download — generate a short-lived presigned URL.
 */
export async function generateDownload(req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();

    const existing = await FileModel.findOne({ fileId: req.params.fileId });
    if (!existing || existing.status !== "active") {
      throw new ApiError(404, "FILE_NOT_FOUND", "This file is no longer available.");
    }
    if (existing.expiresAt < now) {
      throw new ApiError(410, "FILE_EXPIRED", "This file has expired.");
    }

    let receiverId = extractReceiverId(req);
    if (!receiverId) {
      receiverId = crypto.randomBytes(16).toString("hex");
    }

    const file = await claimOrVerifyReceiverSlot(existing, receiverId);

    const presignedUrl = await storage.presignDownloadUrl(file.storageKey, file.sanitizedName);

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

    logger.info({ fileId: file.fileId, downloadSessionId: sessionId, receiverId }, "Download URL issued and session started");

    return ok(res, { downloadUrl: presignedUrl, fileName: file.originalName, sessionId, receiverId });
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

    // We intentionally DO NOT delete the storage object or release storage quota here.
    // This safely protects any receivers who are currently downloading the file.
    // The background cleanup job will physically delete the object and release quota
    // once all active DownloadSession leases reach zero.


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
