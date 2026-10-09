import cron from "node-cron";
import { FileModel } from "@/models/File.model";
import { UploadSessionModel } from "@/models/UploadSession.model";
import { storage } from "@/services/storage.service";
import { releaseActiveStorage, reclaimExpiredReservations, releaseReservation } from "@/services/storageReservation.service";
import { logger } from "@/utils/logger";

/** Expire files whose expiresAt has passed: delete storage object, release storage, mark expired. */
export async function expireOverdueFiles(): Promise<number> {
  const now = new Date();
  const overdue = await FileModel.find({
    $or: [
      { status: { $in: ["active", "exhausted"] }, expiresAt: { $lte: now } },
      { status: "deleted" }
    ]
  }).limit(200);
  let count = 0;

    const { DownloadSessionModel } = await import("@/models/DownloadSession.model");
    const { RoomModel } = await import("@/models/Room.model");

    for (const file of overdue) {
      // 1. Fresh check for active download sessions with unexpired leases
      const [activeSessions, isUsedInActiveRoom] = await Promise.all([
        DownloadSessionModel.countDocuments({
          fileId: file._id,
          status: "active",
          leaseUntil: { $gt: now },
        }),
        RoomModel.exists({
          "files.fileId": file.fileId,
          status: "active",
          expiresAt: { $gt: now },
        }),
      ]);

      if (activeSessions > 0 || isUsedInActiveRoom) {
        // Protect the file while download lease or room session is active.
        continue;
      }

      try {
        await storage.deleteObject(file.storageKey);
      } catch (err) {
        logger.error({ err, fileId: file.fileId }, "Cleanup: failed to delete storage object, will retry next run");
        continue;
      }

      await releaseActiveStorage(file.sizeBytes);
      file.status = "expired";
      if (!file.inactivityTimerStartsAt) {
        file.inactivityTimerStartsAt = file.createdAt || new Date();
      }
      await file.save();
      count++;
      logger.info({ fileId: file.fileId }, "File expired/deleted and cleaned up permanently from B2");
    }

    return count;
  }


export async function sweepAbandonedSessions(): Promise<number> {
  const { env } = await import("@/config/env");
  const staleThreshold = new Date(Date.now() - env.abandonedUploadTimeoutMinutes * 60 * 1000);
  const lockThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minute claim lock
  const legacyGraceThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hour grace for pre-deployment sessions

  const abandoned = await UploadSessionModel.find({
    status: { $in: ["initializing", "uploading"] },
    $or: [
      { lastUploadActivityAt: { $lt: staleThreshold } },
      { lastUploadActivityAt: { $exists: false }, updatedAt: { $lt: legacyGraceThreshold } } // Legacy grace period
    ],
    cleanupClaimedAt: { $not: { $gt: lockThreshold } }
  }).limit(200);

  let count = 0;
  for (const session of abandoned) {
    // Atomic claim guarantees only one worker can process this session, 
    // and verifies it hasn't received a heartbeat since the find() query.
    const lockedSession = await UploadSessionModel.findOneAndUpdate(
      { 
        _id: session._id, 
        status: { $in: ["initializing", "uploading"] },
        $or: [
          { lastUploadActivityAt: { $lt: staleThreshold } },
          { lastUploadActivityAt: { $exists: false }, updatedAt: { $lt: legacyGraceThreshold } }
        ],
        cleanupClaimedAt: session.cleanupClaimedAt
      },
      { $set: { cleanupClaimedAt: new Date() } },
      { new: true }
    );

    if (!lockedSession) {
      continue;
    }

    try {
      await storage.abortMultipartUpload(lockedSession.storageKey, lockedSession.storageUploadId);
    } catch (err) {
      logger.warn({ err, sessionId: lockedSession.sessionId }, "Cleanup: storage abort failed (will retry next cycle)");
      continue;
    }

    await releaseReservation(lockedSession.reservationId as never);
    lockedSession.status = "aborted";
    await lockedSession.save();
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
      status: "active",
      leaseUntil: { $gt: now }
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
  const now = new Date();
  const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
  const { DownloadSessionModel } = await import("@/models/DownloadSession.model");
  const { RoomModel } = await import("@/models/Room.model");

  const overdue = await FileModel.find({
    status: "active",
    $or: [
      { inactivityTimerStartsAt: { $lte: staleThreshold } },
      { inactivityTimerStartsAt: { $exists: false } },
      { inactivityTimerStartsAt: null }
    ]
  }).limit(200);

  let count = 0;
  for (const file of overdue) {
    // FRESH CHECK: Are there any active download sessions or active rooms using this file?
    const [activeSessions, isUsedInActiveRoom] = await Promise.all([
      DownloadSessionModel.countDocuments({
        fileId: file._id,
        status: "active",
        leaseUntil: { $gt: now },
      }),
      RoomModel.exists({
        "files.fileId": file.fileId,
        status: "active",
        expiresAt: { $gt: now },
      }),
    ]);

    if (activeSessions > 0 || isUsedInActiveRoom) {
      // Protected by active download lease or live room
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
    if (!file.inactivityTimerStartsAt) {
      file.inactivityTimerStartsAt = file.createdAt || new Date();
    }
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

export async function sweepExpiredRooms(): Promise<number> {
  const { RoomModel } = await import("@/models/Room.model");
  const { broadcastRoomClosed } = await import("@/services/socket.service");
  const now = new Date();

  const expiredRooms = await RoomModel.find(
    { status: "active", expiresAt: { $lte: now } },
    { roomCode: 1 }
  ).limit(100);

  if (expiredRooms.length === 0) return 0;

  const roomCodes = expiredRooms.map((r) => r.roomCode);
  const res = await RoomModel.updateMany(
    { roomCode: { $in: roomCodes }, status: "active" },
    { $set: { status: "expired" } }
  );

  for (const code of roomCodes) {
    try {
      broadcastRoomClosed(code, "expired");
    } catch (e) {}
  }

  return res.modifiedCount;
}

/** Runs the full cleanup pass. Safe to call repeatedly/concurrently — every step is idempotent. */
export async function runCleanupPass(): Promise<void> {
  const staleDown = await sweepStaleDownloadSessions();
  const [expired, abandoned, reclaimed, noAccess, expiredRooms] = await Promise.all([
    expireOverdueFiles(),
    sweepAbandonedSessions(),
    reclaimExpiredReservations(),
    expireNoAccessFiles(),
    sweepExpiredRooms(),
  ]);
  logger.info({ expired, abandoned, reclaimed, staleDown, noAccess, expiredRooms }, "Cleanup pass complete");
}

export function scheduleCleanupJob() {
  // Every 1 minute.
  const task = cron.schedule("* * * * *", () => {
    runCleanupPass().catch((err) => logger.error({ err }, "Cleanup pass threw"));
  });
  logger.info("Cleanup job scheduled (every 1 minute)");
  return task;
}

