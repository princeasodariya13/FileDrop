import cron from "node-cron";
import { FileModel } from "@/models/File.model";
import { UploadSessionModel } from "@/models/UploadSession.model";
import { storage } from "@/services/storage.service";
import { releaseActiveStorage, reclaimExpiredReservations, releaseReservation } from "@/services/storageReservation.service";
import { logger } from "@/utils/logger";

/** Expire files whose expiresAt has passed: delete storage object, release storage, mark expired. */
export async function expireOverdueFiles(): Promise<number> {
  const overdue = await FileModel.find({
    $or: [
      { status: "active", expiresAt: { $lt: new Date() } },
      { status: "exhausted" },
    ],
  }).limit(200);
  let count = 0;

  for (const file of overdue) {
    try {
      await storage.deleteObject(file.storageKey);
    } catch (err) {
      logger.error({ err, fileId: file.fileId }, "Cleanup: failed to delete storage object, will retry next run");
      continue; // don't mark expired if the object wasn't actually removed
    }

    await releaseActiveStorage(file.sizeBytes);
    file.status = "expired";
    await file.save();
    count++;
    logger.info({ fileId: file.fileId }, "File expired and cleaned up");
  }

  return count;
}

/** Abort + release reservations for upload sessions abandoned by the client. */
export async function sweepAbandonedSessions(): Promise<number> {
  const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h of inactivity
  const abandoned = await UploadSessionModel.find({
    status: { $in: ["initializing", "uploading", "completing"] },
    updatedAt: { $lt: staleThreshold },
  }).limit(200);

  let count = 0;
  for (const session of abandoned) {
    try {
      await storage.abortMultipartUpload(session.storageKey, session.storageUploadId);
    } catch (err) {
      logger.warn({ err, sessionId: session.sessionId }, "Cleanup: storage abort failed (object may not exist)");
    }
    await releaseReservation(session.reservationId as never);
    session.status = "aborted";
    await session.save();
    count++;
  }
  return count;
}

export async function expireNoAccessFiles(): Promise<number> {
  const now = new Date();

  const overdue = await FileModel.find({
    status: "active",
    firstAccessedAt: null,
    noAccessCleanupAt: { $exists: true, $ne: null, $lte: now },
  }).limit(200);

  let count = 0;
  for (const file of overdue) {
    // Final fresh document check to prevent race condition if accessed during cleanup
    const stillUnaccessed = await FileModel.findOne({ _id: file._id, firstAccessedAt: null, status: "active" });
    if (!stillUnaccessed) {
      continue;
    }

    try {
      await storage.deleteObject(file.storageKey);
    } catch (err) {
      logger.error({ err, fileId: file.fileId }, "Cleanup: failed to delete storage object (no-access), will retry next run");
      continue;
    }

    // B2 deletion succeeded, finalize cleanup
    const { releaseActiveStorage } = await import("@/services/storageReservation.service");
    await releaseActiveStorage(file.sizeBytes);

    file.status = "expired";
    await file.save();

    count++;
    logger.info({
      fileId: file.fileId,
      storageKey: file.storageKey,
      uploadedAt: file.createdAt,
      noAccessCleanupAt: file.noAccessCleanupAt
    }, "File automatically deleted because it was uploaded successfully but never accessed within the 2-hour grace period.");
  }

  return count;
}

/** Runs the full cleanup pass. Safe to call repeatedly/concurrently — every step is idempotent. */
export async function runCleanupPass(): Promise<void> {
  const [expired, abandoned, reclaimed, noAccess] = await Promise.all([
    expireOverdueFiles(),
    sweepAbandonedSessions(),
    reclaimExpiredReservations(),
    expireNoAccessFiles(),
  ]);
  logger.info({ expired, abandoned, reclaimed, noAccess }, "Cleanup pass complete");
}

export function scheduleCleanupJob() {
  // Every 1 minute.
  const task = cron.schedule("* * * * *", () => {
    runCleanupPass().catch((err) => logger.error({ err }, "Cleanup pass threw"));
  });
  logger.info("Cleanup job scheduled (every 1 minute)");
  return task;
}
