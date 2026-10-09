import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { RoomModel, IRoomDevice, IRoomFile } from "@/models/Room.model";
import { FileModel } from "@/models/File.model";
import { ApiError, ok } from "@/utils/apiResponse";
import { storage } from "@/services/storage.service";
import {
  generateRoomId,
  generateDeviceId,
  generateDeviceToken,
  generateSecureRoomCode,
} from "@/utils/ids";
import {
  createRoomSchema,
  joinRoomSchema,
  addRoomFileSchema,
  leaveRoomSchema,
} from "@/validators/room.validator";
import {
  broadcastFileShared,
  broadcastFileDeleted,
  broadcastDevicesUpdated,
  handleDeviceRemoved,
  handleDeviceVoluntaryLeave,
} from "@/services/socket.service";
import { logger } from "@/utils/logger";

const ROOM_TTL_MS = 60 * 60 * 1000; // 1 hour

function sanitizeDevices(devices: IRoomDevice[]) {
  return devices.map((d) => ({
    deviceId: d.deviceId,
    deviceName: d.deviceName,
    deviceType: d.deviceType,
    joinedAt: d.joinedAt,
    lastSeenAt: d.lastSeenAt,
    isHost: d.isHost,
  }));
}

/**
 * Synchronizes room files with FileModel to prune expired or deleted files.
 */
async function syncRoomFiles(
  room: InstanceType<typeof RoomModel>,
  callerDeviceId?: string
): Promise<IRoomFile[]> {
  if (!room.files || room.files.length === 0) {
    return [];
  }

  const now = new Date();
  const fileIds = room.files.map((f) => f.fileId);
  const activeDbFiles = await FileModel.find({
    fileId: { $in: fileIds },
    status: { $in: ["active", "deleted"] },
    expiresAt: { $gt: now },
  }).select("fileId");

  const activeIdSet = new Set(activeDbFiles.map((f) => f.fileId));
  const validFiles = room.files.filter((f) => activeIdSet.has(f.fileId));

  if (validFiles.length !== room.files.length) {
    room.files = validFiles;
    await room.save().catch(() => {});
  }

  // Filter out private files not intended for callerDeviceId
  if (callerDeviceId) {
    return validFiles.filter((f) => {
      if (!f.recipientDeviceIds || f.recipientDeviceIds.length === 0) {
        return true;
      }
      return (
        f.uploadedByDeviceId === callerDeviceId ||
        f.recipientDeviceIds.includes(callerDeviceId)
      );
    });
  }

  return validFiles;
}

/**
 * POST /api/rooms — Create a new multi-device room with a unique 6-digit code
 */
export async function createRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid request body.");
    }

    const { deviceName = "Host Device", deviceType = "unknown" } = parsed.data;

    // Secure code generation with collision retry loop
    let roomCode = "";
    const now = new Date();
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateSecureRoomCode();
      const existing = await RoomModel.findOne({
        roomCode: candidate,
        status: "active",
        expiresAt: { $gt: now },
      });
      if (!existing) {
        roomCode = candidate;
        break;
      }
    }

    if (!roomCode) {
      throw new ApiError(500, "CODE_GENERATION_FAILED", "Could not allocate an available room code. Please try again.");
    }

    const roomId = generateRoomId();
    const deviceId = generateDeviceId();
    const deviceToken = generateDeviceToken();
    const expiresAt = new Date(Date.now() + ROOM_TTL_MS);

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex");

    const hostDevice: IRoomDevice = {
      deviceId,
      deviceToken,
      deviceName: deviceName.slice(0, 50),
      deviceType,
      ipHash,
      joinedAt: now,
      lastSeenAt: now,
      isHost: true,
    };

    const room = await RoomModel.create({
      roomId,
      roomCode,
      hostDeviceId: deviceId,
      creatorIpHash: ipHash,
      status: "active",
      devices: [hostDevice],
      files: [],
      expiresAt,
      lastActivityAt: now,
    });

    logger.info({ roomId: room.roomId, roomCode: room.roomCode, hostDeviceId: deviceId }, "Connect Devices room created");

    return ok(res, {
      roomCode: room.roomCode,
      roomId: room.roomId,
      deviceId,
      deviceToken,
      expiresAt: room.expiresAt,
      status: room.status,
      devices: sanitizeDevices(room.devices),
      files: room.files,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/join — Join an active room by 6-digit code
 */
export async function joinRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = joinRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid request body.");
    }

    const { code, deviceName = "Connected Device", deviceType = "unknown" } = parsed.data;
    const now = new Date();

    const room = await RoomModel.findOne({
      roomCode: code,
      status: "active",
      expiresAt: { $gt: now },
    });

    if (!room) {
      throw new ApiError(404, "ROOM_NOT_FOUND", "Room not found or has expired. Please check your 6-digit code.");
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex");

    const deviceId = generateDeviceId();
    const deviceToken = generateDeviceToken();

    const newDevice: IRoomDevice = {
      deviceId,
      deviceToken,
      deviceName: deviceName.slice(0, 50),
      deviceType,
      ipHash,
      joinedAt: now,
      lastSeenAt: now,
      isHost: false,
    };

    room.devices.push(newDevice);
    room.lastActivityAt = now;
    await room.save();

    logger.info({ roomId: room.roomId, roomCode: room.roomCode, deviceId, deviceName }, "Device joined room");
    broadcastDevicesUpdated(room.roomCode, sanitizeDevices(room.devices));

    const syncedFiles = await syncRoomFiles(room);

    return ok(res, {
      roomCode: room.roomCode,
      roomId: room.roomId,
      deviceId,
      deviceToken,
      isHost: false,
      expiresAt: room.expiresAt,
      status: room.status,
      devices: sanitizeDevices(room.devices),
      files: syncedFiles,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/rooms/active/lookup — Look up active room for this client IP/machine across browsers
 */
export async function getActiveRoomForClient(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex");
    const now = new Date();

    const activeRoom = await RoomModel.findOne({
      $or: [
        { creatorIpHash: ipHash },
        { "devices.ipHash": ipHash },
      ],
      status: "active",
      expiresAt: { $gt: now },
    }).sort({ lastActivityAt: -1 });

    if (!activeRoom) {
      return ok(res, { activeRoom: null });
    }

    const syncedFiles = await syncRoomFiles(activeRoom);

    return ok(res, {
      activeRoom: {
        roomCode: activeRoom.roomCode,
        roomId: activeRoom.roomId,
        status: activeRoom.status,
        expiresAt: activeRoom.expiresAt,
        lastActivityAt: activeRoom.lastActivityAt,
        devices: sanitizeDevices(activeRoom.devices),
        files: syncedFiles,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/rooms/:code — Retrieve current room state (devices, files, expiry)
 */
export async function getRoomState(req: Request, res: Response, next: NextFunction) {
  try {
    const rawCode = req.params.code;
    if (!rawCode || typeof rawCode !== "string") {
      throw new ApiError(400, "INVALID_CODE", "Room code or ID is required.");
    }

    const code = rawCode.trim();
    const now = new Date();

    const room = await RoomModel.findOne({
      $or: [{ roomCode: code }, { roomId: code }],
      status: "active",
      expiresAt: { $gt: now },
    });

    if (!room) {
      throw new ApiError(404, "ROOM_NOT_FOUND", "This room does not exist or has expired.");
    }

    // Touch device last seen if header present
    const rawDeviceId = req.headers["x-device-id"];
    const callerDeviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : undefined;
    if (callerDeviceId) {
      const device = room.devices.find((d) => d.deviceId === callerDeviceId);
      if (device) {
        device.lastSeenAt = now;
        await RoomModel.updateOne(
          { _id: room._id, "devices.deviceId": callerDeviceId },
          { $set: { "devices.$.lastSeenAt": now } }
        );
      }
    }

    const syncedFiles = await syncRoomFiles(room, callerDeviceId);

    return ok(res, {
      roomCode: room.roomCode,
      roomId: room.roomId,
      status: room.status,
      expiresAt: room.expiresAt,
      lastActivityAt: room.lastActivityAt,
      devices: sanitizeDevices(room.devices),
      files: syncedFiles,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/rooms/:code/files — List all active shared files in the room
 */
export async function getRoomFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const rawCode = req.params.code;
    if (!rawCode || typeof rawCode !== "string") {
      throw new ApiError(400, "INVALID_CODE", "Room code or ID is required.");
    }

    const code = rawCode.trim();
    const now = new Date();

    const room = await RoomModel.findOne({
      $or: [{ roomCode: code }, { roomId: code }],
      status: "active",
      expiresAt: { $gt: now },
    });

    if (!room) {
      throw new ApiError(404, "ROOM_NOT_FOUND", "This room does not exist or has expired.");
    }

    const rawDeviceId = req.headers["x-device-id"];
    const callerDeviceId = typeof rawDeviceId === "string" ? rawDeviceId.trim() : undefined;
    const syncedFiles = await syncRoomFiles(room, callerDeviceId);

    return ok(res, {
      roomCode: room.roomCode,
      files: syncedFiles,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/:code/files — Add a newly uploaded file to the shared room
 */
export async function addFileToRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const rawCode = req.params.code;
    if (!rawCode || typeof rawCode !== "string") {
      throw new ApiError(400, "INVALID_CODE", "Room code or ID is required.");
    }

    const parsed = addRoomFileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid file data.");
    }

    const { fileId, possessionToken, recipientDeviceIds } = parsed.data;
    const callerDeviceId = req.headers["x-device-id"] as string;
    const callerDeviceToken = req.headers["x-device-token"] as string;
    const now = new Date();

    const room = await RoomModel.findOne({
      $or: [{ roomCode: rawCode.trim() }, { roomId: rawCode.trim() }],
      status: "active",
      expiresAt: { $gt: now },
    });

    if (!room) {
      throw new ApiError(404, "ROOM_NOT_FOUND", "This room does not exist or has expired.");
    }

    // Verify caller device authorization if credentials provided
    let uploaderName = "Connected Device";
    if (callerDeviceId) {
      const callerDevice = room.devices.find((d) => d.deviceId === callerDeviceId);
      if (callerDevice) {
        if (callerDeviceToken && callerDevice.deviceToken !== callerDeviceToken) {
          throw new ApiError(401, "UNAUTHORIZED", "Invalid device token for this room.");
        }
        uploaderName = callerDevice.deviceName;
      }
    }

    // Verify file exists in FileModel and is active
    const fileQuery: Record<string, unknown> = {
      fileId,
      status: "active",
      expiresAt: { $gt: now },
    };
    if (possessionToken) {
      fileQuery.possessionToken = possessionToken;
    }

    const file = await FileModel.findOne(fileQuery);
    if (!file) {
      throw new ApiError(404, "FILE_NOT_FOUND", "The specified file was not found, has expired, or is incomplete.");
    }

    // Filter valid recipient device IDs belonging to room
    let cleanRecipientIds: string[] | undefined = undefined;
    if (recipientDeviceIds && recipientDeviceIds.length > 0) {
      const validDeviceIds = new Set(room.devices.map((d) => d.deviceId));
      const filtered = Array.from(
        new Set(recipientDeviceIds.filter((id) => validDeviceIds.has(id) && id !== callerDeviceId))
      );
      if (filtered.length > 0) {
        cleanRecipientIds = filtered;
      }
    }

    let addedFile: IRoomFile | null = null;
    const alreadyPresent = room.files.some((f) => f.fileId === file.fileId);
    if (!alreadyPresent) {
      addedFile = {
        fileId: file.fileId,
        fileName: file.originalName,
        sizeBytes: file.sizeBytes,
        mimeType: file.mimeType,
        uploadedByDeviceId: callerDeviceId || "unknown",
        uploadedByDeviceName: uploaderName,
        recipientDeviceIds: cleanRecipientIds || [],
        createdAt: now,
      };
      room.files.push(addedFile);
    }

    // Refresh room activity and extend TTL
    room.lastActivityAt = now;
    room.expiresAt = new Date(Date.now() + ROOM_TTL_MS);
    await room.save();

    logger.info({ roomId: room.roomId, roomCode: room.roomCode, fileId: file.fileId }, "File attached to room");

    // Announce file to authorized room peers in real-time only after successful DB persistence
    if (addedFile) {
      await broadcastFileShared(room.roomCode, addedFile);
    }

    const callerFiles = await syncRoomFiles(room, callerDeviceId);

    return ok(res, {
      roomCode: room.roomCode,
      files: callerFiles,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/:code/files/:fileId/download — Generate presigned download URL for an authorized room file
 */
export async function downloadRoomFile(req: Request, res: Response, next: NextFunction) {
  try {
    const rawCode = req.params.code;
    const fileId = req.params.fileId;
    if (!rawCode || !fileId) {
      throw new ApiError(400, "INVALID_PARAMS", "Room code and file ID are required.");
    }

    const callerDeviceId = req.headers["x-device-id"] as string;
    const callerDeviceToken = req.headers["x-device-token"] as string;

    const now = new Date();
    const room = await RoomModel.findOne({
      $or: [{ roomCode: rawCode.trim() }, { roomId: rawCode.trim() }],
      status: "active",
      expiresAt: { $gt: now },
    });

    if (!room) {
      throw new ApiError(404, "ROOM_NOT_FOUND", "This room does not exist or has expired.");
    }

    // Verify caller device authentication if tokens provided
    if (callerDeviceId && callerDeviceToken) {
      const isMember = room.devices.some(
        (d) => d.deviceId === callerDeviceId && d.deviceToken === callerDeviceToken
      );
      if (!isMember) {
        throw new ApiError(401, "UNAUTHORIZED", "Device is not authorized for this room.");
      }
    }

    // Verify file is associated with this room
    const targetRoomFile = room.files.find((f) => f.fileId === fileId);
    if (!targetRoomFile) {
      throw new ApiError(404, "FILE_NOT_FOUND", "This file is not associated with this room.");
    }

    // Verify recipient authorization for private files
    if (targetRoomFile.recipientDeviceIds && targetRoomFile.recipientDeviceIds.length > 0) {
      if (
        !callerDeviceId ||
        (targetRoomFile.uploadedByDeviceId !== callerDeviceId &&
          !targetRoomFile.recipientDeviceIds.includes(callerDeviceId))
      ) {
        throw new ApiError(403, "FORBIDDEN", "You are not an authorized recipient for this private file.");
      }
    }

    // Verify file in FileModel
    const file = await FileModel.findOne({
      fileId,
      status: { $in: ["active", "deleted"] },
      expiresAt: { $gt: now },
    });

    if (!file) {
      throw new ApiError(404, "FILE_NOT_FOUND", "This file is no longer available or has expired.");
    }

    // Generate presigned download URL
    const presignedUrl = await storage.presignDownloadUrl(file.storageKey, file.sanitizedName);

    const { DownloadSessionModel } = await import("@/models/DownloadSession.model");
    const { DownloadEventModel } = await import("@/models/DownloadEvent.model");
    const { generateSessionId } = await import("@/utils/ids");

    const sessionId = generateSessionId();
    await DownloadSessionModel.create({
      sessionId,
      fileId: file._id,
      leaseUntil: new Date(Date.now() + 5 * 60 * 1000), // 5 min lease
      status: "active",
    });

    const ipHash = crypto.createHash("sha256").update(req.ip ?? "unknown").digest("hex");
    await DownloadEventModel.create({
      fileId: file._id,
      ipHash,
      userAgent: req.get("user-agent") ?? "",
    });

    logger.info(
      { roomId: room.roomId, roomCode: room.roomCode, fileId: file.fileId, callerDeviceId },
      "Room file download URL generated"
    );

    return ok(res, {
      downloadUrl: presignedUrl,
      fileName: file.originalName,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      sessionId,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/:code/leave — Leave a room voluntarily
 */
export async function leaveRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const rawCode = req.params.code;
    if (!rawCode || typeof rawCode !== "string") {
      throw new ApiError(400, "INVALID_CODE", "Room code or ID is required.");
    }

    const parsed = leaveRoomSchema.safeParse(req.body);
    const rawDeviceId = req.headers["x-device-id"];
    const callerDeviceId =
      (typeof rawDeviceId === "string" ? rawDeviceId.trim() : undefined) || parsed.data?.deviceId;

    if (!callerDeviceId) {
      return ok(res, { success: true });
    }

    const now = new Date();
    const room = await RoomModel.findOne({
      $or: [{ roomCode: rawCode.trim() }, { roomId: rawCode.trim() }],
      status: "active",
      expiresAt: { $gt: now },
    });

    if (!room) {
      return ok(res, { success: true, message: "Room not active" });
    }

    const leavingDevice = room.devices.find((d) => d.deviceId === callerDeviceId);
    if (!leavingDevice) {
      // Device was already not in room
      return ok(res, { success: true });
    }

    const remainingDevices = room.devices.filter((d) => d.deviceId !== callerDeviceId);
    const wasHost = leavingDevice.isHost;

    if (remainingDevices.length === 0) {
      // Last participant left -> close room cleanly
      room.devices = [];
      room.status = "closed";
      room.lastActivityAt = now;
      await room.save();

      logger.info(
        { roomId: room.roomId, roomCode: room.roomCode, deviceId: callerDeviceId },
        "Room closed as last participant left voluntarily"
      );

      await handleDeviceVoluntaryLeave(
        room.roomCode,
        callerDeviceId,
        leavingDevice.deviceName,
        [],
        true
      );

      return ok(res, { success: true, roomClosed: true });
    }

    if (wasHost) {
      // Host left: automatically transfer host ownership to the next earliest joined participant
      remainingDevices[0].isHost = true;
      room.hostDeviceId = remainingDevices[0].deviceId;
      logger.info(
        {
          roomId: room.roomId,
          roomCode: room.roomCode,
          oldHost: callerDeviceId,
          newHost: remainingDevices[0].deviceId,
        },
        "Host transferred to next participant upon voluntary departure"
      );
    }

    room.devices = remainingDevices;
    room.lastActivityAt = now;
    await room.save();

    logger.info(
      { roomId: room.roomId, roomCode: room.roomCode, deviceId: callerDeviceId },
      "Device left room voluntarily"
    );

    const sanitized = sanitizeDevices(room.devices);
    await handleDeviceVoluntaryLeave(
      room.roomCode,
      callerDeviceId,
      leavingDevice.deviceName,
      sanitized,
      false
    );

    return ok(res, {
      success: true,
      hostTransferred: wasHost,
      newHostDeviceId: wasHost ? remainingDevices[0].deviceId : undefined,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/rooms/:code/files/:fileId — Delete a file uploaded by the calling device
 */
export async function deleteRoomFile(req: Request, res: Response, next: NextFunction) {
  try {
    const rawCode = req.params.code;
    const fileId = req.params.fileId;
    if (!rawCode || !fileId) {
      throw new ApiError(400, "INVALID_PARAMS", "Room code and file ID are required.");
    }

    const callerDeviceId = req.headers["x-device-id"] as string;
    const callerDeviceToken = req.headers["x-device-token"] as string;

    if (!callerDeviceId || !callerDeviceToken) {
      throw new ApiError(401, "UNAUTHORIZED", "Device credentials required to delete file.");
    }

    const now = new Date();
    const room = await RoomModel.findOne({
      $or: [{ roomCode: rawCode.trim() }, { roomId: rawCode.trim() }],
      status: "active",
      expiresAt: { $gt: now },
    });

    if (!room) {
      throw new ApiError(404, "ROOM_NOT_FOUND", "This room does not exist or has expired.");
    }

    // Authenticate device token and room membership
    const callerDevice = room.devices.find(
      (d) => d.deviceId === callerDeviceId && d.deviceToken === callerDeviceToken
    );
    if (!callerDevice) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid device authorization for this room.");
    }

    // Verify file is associated with this room
    const fileIndex = room.files.findIndex((f) => f.fileId === fileId);
    if (fileIndex === -1) {
      throw new ApiError(404, "FILE_NOT_FOUND", "This file is not associated with this room.");
    }

    const targetFile = room.files[fileIndex];

    // Strictly enforce ownership: caller must be original uploader
    if (targetFile.uploadedByDeviceId !== callerDeviceId) {
      throw new ApiError(403, "FORBIDDEN", "You can only delete files uploaded by your device.");
    }

    // Remove file from room
    room.files.splice(fileIndex, 1);
    room.lastActivityAt = now;
    await room.save();

    logger.info(
      { roomId: room.roomId, roomCode: room.roomCode, fileId, callerDeviceId },
      "File deleted from room by owner"
    );

    // Notify all room participants in real time via Socket.IO
    broadcastFileDeleted(room.roomCode, fileId);

    // Safe storage cleanup: only delete storage object if NOT used in Quick Share or other active rooms
    try {
      const fileDoc = await FileModel.findOne({ fileId });
      if (fileDoc) {
        const isQuickShare = Boolean(fileDoc.code);
        const otherRoomUsingFile = await RoomModel.exists({
          _id: { $ne: room._id },
          "files.fileId": fileId,
          status: "active",
          expiresAt: { $gt: now },
        });

        if (!isQuickShare && !otherRoomUsingFile) {
          fileDoc.status = "deleted";
          await fileDoc.save();

          // Delete object from Backblaze B2 storage
          await storage.deleteObject(fileDoc.storageKey).catch((storageErr) => {
            logger.warn({ err: storageErr, fileId }, "Could not delete B2 storage object during room file delete");
          });

          if (fileDoc.reservationId) {
            const { StorageReservationModel } = await import("@/models/StorageReservation.model");
            await StorageReservationModel.updateOne(
              { _id: fileDoc.reservationId },
              { $set: { status: "released" } }
            ).catch(() => {});
          }
        }
      }
    } catch (cleanupErr) {
      logger.warn({ err: cleanupErr, fileId }, "Safe storage cleanup warning during room file delete");
    }

    return ok(res, {
      success: true,
      roomCode: room.roomCode,
      fileId,
      files: room.files,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/rooms/:code/devices/:deviceId — Remove a device from the room (Host only)
 */
export async function removeRoomDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const rawCode = req.params.code;
    const targetDeviceId = req.params.deviceId;
    if (!rawCode || !targetDeviceId) {
      throw new ApiError(400, "INVALID_PARAMS", "Room code and device ID are required.");
    }

    const callerDeviceId = req.headers["x-device-id"] as string;
    const callerDeviceToken = req.headers["x-device-token"] as string;

    if (!callerDeviceId || !callerDeviceToken) {
      throw new ApiError(401, "UNAUTHORIZED", "Host device credentials required.");
    }

    const now = new Date();
    const room = await RoomModel.findOne({
      $or: [{ roomCode: rawCode.trim() }, { roomId: rawCode.trim() }],
      status: "active",
      expiresAt: { $gt: now },
    });

    if (!room) {
      throw new ApiError(404, "ROOM_NOT_FOUND", "This room does not exist or has expired.");
    }

    // Authenticate caller and verify host status
    const hostDevice = room.devices.find(
      (d) => d.deviceId === callerDeviceId && d.deviceToken === callerDeviceToken
    );

    if (!hostDevice || !hostDevice.isHost || room.hostDeviceId !== callerDeviceId) {
      throw new ApiError(403, "FORBIDDEN", "Only the room host can remove devices.");
    }

    // Prevent host from removing themselves
    if (callerDeviceId === targetDeviceId) {
      throw new ApiError(400, "BAD_REQUEST", "The host cannot remove themselves from the room.");
    }

    // Locate target device
    const targetDeviceIndex = room.devices.findIndex((d) => d.deviceId === targetDeviceId);
    if (targetDeviceIndex === -1) {
      throw new ApiError(404, "DEVICE_NOT_FOUND", "The specified device is not in this room.");
    }

    const removedDevice = room.devices[targetDeviceIndex];

    // Remove device from room.devices
    room.devices.splice(targetDeviceIndex, 1);
    room.lastActivityAt = now;
    await room.save();

    const sanitized = sanitizeDevices(room.devices);

    logger.info(
      { roomId: room.roomId, roomCode: room.roomCode, hostDeviceId: callerDeviceId, targetDeviceId },
      "Host removed device from room"
    );

    // Disconnect target socket immediately and broadcast updated device list
    await handleDeviceRemoved(
      room.roomCode,
      targetDeviceId,
      removedDevice.deviceName,
      sanitized
    );

    return ok(res, {
      success: true,
      roomCode: room.roomCode,
      removedDeviceId: targetDeviceId,
      devices: sanitized,
    });
  } catch (err) {
    next(err);
  }
}
