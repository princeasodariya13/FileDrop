import cron from "node-cron";
import { FileModel } from "@/models/File.model";
import { UploadSessionModel } from "@/models/UploadSession.model";
import { storage } from "@/services/storage.service";
import { releaseActiveStorage, reclaimExpiredReservations, releaseReservation } from "@/services/storageReservation.service";
import { logger } from "@/utils/logger";

/** Expire files whose expiresAt has passed: delete storage object, release storage, mark expired. */
export async function expireOverdueFiles(): Promise<number> {
  const overdue = await FileModel.find({
    status: { $in: ["active", "exhausted"] },
    expiresAt: { $lt: new Date() },
  }).limit(200);
  let count = 0;

  const { DownloadSessionModel } = await import("@/models/DownloadSession.model");

  for (const file of overdue) {
    // 1. Fresh check for active download sessions
    if (file.status === "active") {
      const activeSessions = await DownloadSessionModel.countDocuments({
        fileId: file._id,
        status: "active"
      });
      if (activeSessions > 0) {
        // Protect the file while download is active.
        continue;
      }
    }

    try {
      await storage.deleteObject(file.storageKey);
    } catch (err) {
      logger.error({ err, fileId: file.fileId }, "Cleanup: failed to delete storage object, will retry next run");
      continue;
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

export async function sweepStaleDownloadSessions(): Promise<number> {
  const { DownloadSessionModel } = await import("@/models/DownloadSession.model");
  const now = new Date();

  const staleSessions = await DownloadSessionModel.find({
    status: "active",
    leaseUntil: { $lt: now }
  }).limit(500);

  let count = 0;
  for (const session of staleSessions) {
    session.status = "stale";
    await session.save();

    // Check if THIS was the absolute last active session for this file
    const otherActive = await DownloadSessionModel.countDocuments({
      fileId: session.fileId,
      status: "active"
    });

    if (otherActive === 0) {
      // The LAST active session became stale. Restart the 2-hour inactivity timer.
      await FileModel.updateOne(
        { _id: session.fileId },
        { $set: { inactivityTimerStartsAt: now } }
      );
    }
    count++;
  }
  return count;
}

export async function expireNoAccessFiles(): Promise<number> {
  const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
  const { DownloadSessionModel } = await import("@/models/DownloadSession.model");

  const overdue = await FileModel.find({
    status: "active",
    inactivityTimerStartsAt: { $lte: staleThreshold },
  }).limit(200);

  let count = 0;
  for (const file of overdue) {
    // FRESH CHECK: Are there any newly started active download sessions?
    const activeSessions = await DownloadSessionModel.countDocuments({
      fileId: file._id,
      status: "active"
    });
    if (activeSessions > 0) {
      // Receiver started a download just in time. Skip deletion!
      continue;
    }

    try {
      await storage.deleteObject(file.storageKey);
    } catch (err) {
      logger.error({ err, fileId: file.fileId }, "Cleanup: failed to delete storage object (inactivity), will retry next run");
      continue;
    }

    await releaseActiveStorage(file.sizeBytes);

    file.status = "expired";
    await file.save();

    count++;
    logger.info({
      fileId: file.fileId,
      storageKey: file.storageKey,
      inactivityTimerStartsAt: file.inactivityTimerStartsAt
    }, "File automatically deleted due to 2-hour inactivity period.");
  }

  return count;
}

/** Runs the full cleanup pass. Safe to call repeatedly/concurrently — every step is idempotent. */
export async function runCleanupPass(): Promise<void> {
  const [expired, abandoned, reclaimed, staleDown, noAccess] = await Promise.all([
    expireOverdueFiles(),
    sweepAbandonedSessions(),
    reclaimExpiredReservations(),
    sweepStaleDownloadSessions(),
    expireNoAccessFiles(),
  ]);
  logger.info({ expired, abandoned, reclaimed, staleDown, noAccess }, "Cleanup pass complete");
}

export function scheduleCleanupJob() {
  // Every 1 minute.
  const task = cron.schedule("* * * * *", () => {
    runCleanupPass().catch((err) => logger.error({ err }, "Cleanup pass threw"));
  });
  logger.info("Cleanup job scheduled (every 1 minute)");
  return task;
}
