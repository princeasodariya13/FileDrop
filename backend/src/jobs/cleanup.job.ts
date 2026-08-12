import cron from "node-cron";
import { FileModel } from "@/models/File.model";
import { UploadSessionModel } from "@/models/UploadSession.model";
import * as r2 from "@/services/r2.service";
import { releaseActiveStorage, reclaimExpiredReservations, releaseReservation } from "@/services/storageReservation.service";
import { logger } from "@/utils/logger";

/** Expire files whose expiresAt has passed: delete R2 object, release storage, mark expired. */
export async function expireOverdueFiles(): Promise<number> {
  const overdue = await FileModel.find({ status: "active", expiresAt: { $lt: new Date() } }).limit(200);
  let count = 0;

  for (const file of overdue) {
    try {
      await r2.deleteObject(file.r2Key);
    } catch (err) {
      logger.error({ err, fileId: file.fileId }, "Cleanup: failed to delete R2 object, will retry next run");
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
      await r2.abortMultipartUpload(session.r2Key, session.r2UploadId);
    } catch (err) {
      logger.warn({ err, sessionId: session.sessionId }, "Cleanup: R2 abort failed (object may not exist)");
    }
    await releaseReservation(session.reservationId as never);
    session.status = "aborted";
    await session.save();
    count++;
  }
  return count;
}

/** Runs the full cleanup pass. Safe to call repeatedly/concurrently — every step is idempotent. */
export async function runCleanupPass(): Promise<void> {
  const [expired, abandoned, reclaimed] = await Promise.all([
    expireOverdueFiles(),
    sweepAbandonedSessions(),
    reclaimExpiredReservations(),
  ]);
  logger.info({ expired, abandoned, reclaimed }, "Cleanup pass complete");
}

export function scheduleCleanupJob(): void {
  // Every 5 minutes.
  cron.schedule("*/5 * * * *", () => {
    runCleanupPass().catch((err) => logger.error({ err }, "Cleanup pass threw"));
  });
  logger.info("Cleanup job scheduled (every 5 minutes)");
}
