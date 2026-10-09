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
  broadcastDevicesUpdated,
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
async function syncRoomFiles(room: InstanceType<typeof RoomModel>): Promise<IRoomFile[]> {
  if (!room.files || room.files.length === 0) {
    return [];
  }

  const now = new Date();
  const fileIds = room.files.map((f) => f.fileId);
  const activeDbFiles = await FileModel.find({
    fileId: { $in: fileIds },
    status: "active",
    expiresAt: { $gt: now },
  }).select("fileId");

  const activeIdSet = new Set(activeDbFiles.map((f) => f.fileId));
  const validFiles = room.files.filter((f) => activeIdSet.has(f.fileId));

  if (validFiles.length !== room.files.length) {
    room.files = validFiles;
    await room.save().catch(() => {});
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

    const hostDevice: IRoomDevice = {
      deviceId,
      deviceToken,
      deviceName: deviceName.slice(0, 50),
      deviceType,
      joinedAt: now,
      lastSeenAt: now,
      isHost: true,
    };

    const room = await RoomModel.create({
      roomId,
      roomCode,
      hostDeviceId: deviceId,
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

    const deviceId = generateDeviceId();
    const deviceToken = generateDeviceToken();

    const newDevice: IRoomDevice = {
      deviceId,
      deviceToken,
      deviceName: deviceName.slice(0, 50),
      deviceType,
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
    const callerDeviceId = req.headers["x-device-id"];
    if (typeof callerDeviceId === "string" && callerDeviceId) {
      const device = room.devices.find((d) => d.deviceId === callerDeviceId);
      if (device) {
        device.lastSeenAt = now;
        await RoomModel.updateOne(
          { _id: room._id, "devices.deviceId": callerDeviceId },
          { $set: { "devices.$.lastSeenAt": now } }
        );
      }
    }

    const syncedFiles = await syncRoomFiles(room);

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

    const syncedFiles = await syncRoomFiles(room);

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

    const { fileId, possessionToken } = parsed.data;
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
      broadcastFileShared(room.roomCode, addedFile);
    }

    return ok(res, {
      roomCode: room.roomCode,
      files: room.files,
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
    const isFileInRoom = room.files.some((f) => f.fileId === fileId);
    if (!isFileInRoom) {
      throw new ApiError(404, "FILE_NOT_FOUND", "This file is not associated with this room.");
    }

    // Verify file in FileModel
    const file = await FileModel.findOne({
      fileId,
      status: "active",
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
 * POST /api/rooms/:code/leave — Leave a room
 */
export async function leaveRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const rawCode = req.params.code;
    if (!rawCode || typeof rawCode !== "string") {
      throw new ApiError(400, "INVALID_CODE", "Room code or ID is required.");
    }

    const parsed = leaveRoomSchema.safeParse(req.body);
    const callerDeviceId = (req.headers["x-device-id"] as string) || parsed.data?.deviceId;

    if (!callerDeviceId) {
      return ok(res, { success: true });
    }

    const room = await RoomModel.findOne({
      $or: [{ roomCode: rawCode.trim() }, { roomId: rawCode.trim() }],
      status: "active",
    });

    if (room) {
      room.devices = room.devices.filter((d) => d.deviceId !== callerDeviceId);
      room.lastActivityAt = new Date();
      await room.save();
      logger.info({ roomId: room.roomId, deviceId: callerDeviceId }, "Device left room");
      broadcastDevicesUpdated(room.roomCode, sanitizeDevices(room.devices));
    }

    return ok(res, { success: true });
  } catch (err) {
    next(err);
  }
}
