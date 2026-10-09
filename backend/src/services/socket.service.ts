import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { RoomModel, IRoomDevice, IRoomFile } from "@/models/Room.model";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";

let io: Server | null = null;

export interface SocketAuthData {
  roomCode: string;
  deviceId: string;
  deviceToken: string;
}

export interface AuthenticatedSocketData {
  roomCode: string;
  roomId: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  isHost: boolean;
}

function getCorsOrigin(): string | string[] | boolean {
  if (!env.frontendOrigin || env.frontendOrigin === "*") return true;
  if (env.frontendOrigin.includes(",")) {
    return env.frontendOrigin.split(",").map((o) => o.trim());
  }
  return env.frontendOrigin;
}

/**
 * Authenticates a device token against the database room record.
 * Never trusts a client-supplied roomCode or deviceId without a matching deviceToken.
 */
async function authenticateDevice(
  roomCode: string,
  deviceId: string,
  deviceToken: string
): Promise<{ room: InstanceType<typeof RoomModel>; device: IRoomDevice } | null> {
  if (!roomCode || !deviceId || !deviceToken) {
    return null;
  }

  const cleanCode = roomCode.trim();
  const cleanDeviceId = deviceId.trim();
  const cleanToken = deviceToken.trim();
  const now = new Date();

  const room = await RoomModel.findOne({
    $or: [{ roomCode: cleanCode }, { roomId: cleanCode }],
    status: "active",
    expiresAt: { $gt: now },
  });

  if (!room) {
    return null;
  }

  const device = room.devices.find(
    (d) => d.deviceId === cleanDeviceId && d.deviceToken === cleanToken
  );

  if (!device) {
    return null;
  }

  return { room, device };
}

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: getCorsOrigin(),
      methods: ["GET", "POST"],
      credentials: false,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.on("connection", (socket: Socket) => {
    logger.debug({ socketId: socket.id }, "Socket connected");

    // Optional handshake authentication
    const auth = socket.handshake.auth as Partial<SocketAuthData>;
    if (auth.roomCode && auth.deviceId && auth.deviceToken) {
      handleJoinRoom(socket, {
        roomCode: auth.roomCode,
        deviceId: auth.deviceId,
        deviceToken: auth.deviceToken,
      }).catch((err) => {
        logger.warn({ err, socketId: socket.id }, "Handshake room join failed");
      });
    }

    // Explicit join_room event with token verification
    socket.on("join_room", async (data: SocketAuthData, callback?: (res: { success: boolean; error?: string }) => void) => {
      try {
        const result = await handleJoinRoom(socket, data);
        if (callback) callback({ success: result });
      } catch (err) {
        logger.error({ err, socketId: socket.id }, "Error in join_room handler");
        if (callback) callback({ success: false, error: "Authentication failed" });
      }
    });

    // Explicit leave_room event
    socket.on("leave_room", async () => {
      await handleLeaveRoom(socket);
    });

    // Ping / heartbeat event to refresh room and device active state
    socket.on("ping_room", async () => {
      const data = socket.data as Partial<AuthenticatedSocketData>;
      if (data.roomCode && data.deviceId) {
        const now = new Date();
        await RoomModel.updateOne(
          { roomCode: data.roomCode, "devices.deviceId": data.deviceId },
          { $set: { "devices.$.lastSeenAt": now, lastActivityAt: now } }
        ).catch(() => {});
      }
    });

    socket.on("disconnect", async (reason) => {
      logger.debug({ socketId: socket.id, reason }, "Socket disconnected");
      await handleLeaveRoom(socket);
    });
  });

  logger.info("Socket.IO real-time server initialized");
  return io;
}

async function handleJoinRoom(socket: Socket, data: SocketAuthData): Promise<boolean> {
  const authResult = await authenticateDevice(data.roomCode, data.deviceId, data.deviceToken);

  if (!authResult) {
    socket.emit("room_error", {
      code: "UNAUTHORIZED",
      message: "Device authentication failed or room has expired.",
    });
    return false;
  }

  const { room, device } = authResult;
  const roomChannel = `room:${room.roomCode}`;

  // If socket was already in another room channel, leave it first
  const currentData = socket.data as Partial<AuthenticatedSocketData>;
  if (currentData.roomCode && currentData.roomCode !== room.roomCode) {
    socket.leave(`room:${currentData.roomCode}`);
  }

  await socket.join(roomChannel);

  socket.data = {
    roomCode: room.roomCode,
    roomId: room.roomId,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    deviceType: device.deviceType,
    isHost: device.isHost,
  };

  const now = new Date();
  await RoomModel.updateOne(
    { _id: room._id, "devices.deviceId": device.deviceId },
    { $set: { "devices.$.lastSeenAt": now, lastActivityAt: now } }
  );

  // Notify other devices in the room that a peer joined (sanitized, no tokens)
  socket.to(roomChannel).emit("peer_joined", {
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    deviceType: device.deviceType,
    isHost: device.isHost,
    joinedAt: device.joinedAt,
    totalDevices: room.devices.length,
  });

  socket.emit("room_joined", {
    roomCode: room.roomCode,
    roomId: room.roomId,
    deviceId: device.deviceId,
    isHost: device.isHost,
    expiresAt: room.expiresAt,
  });

  logger.info(
    { socketId: socket.id, roomCode: room.roomCode, deviceId: device.deviceId },
    "Socket joined room channel"
  );
  return true;
}

async function handleLeaveRoom(socket: Socket): Promise<void> {
  const data = socket.data as Partial<AuthenticatedSocketData>;
  if (!data.roomCode || !data.deviceId) {
    return;
  }

  const roomChannel = `room:${data.roomCode}`;
  socket.leave(roomChannel);

  // Broadcast peer_left to room members
  socket.to(roomChannel).emit("peer_left", {
    deviceId: data.deviceId,
    deviceName: data.deviceName,
    leftAt: new Date(),
    reason: "voluntary_leave",
  });

  delete (socket.data as any).deviceId;
  delete (socket.data as any).deviceToken;
  delete (socket.data as any).roomCode;
}

/**
 * Broadcasts a newly committed file to authorized participants in the room.
 */
export async function broadcastFileShared(roomCode: string, file: IRoomFile): Promise<void> {
  if (!io) return;
  const roomChannel = `room:${roomCode}`;
  const payload = {
    fileId: file.fileId,
    fileName: file.fileName,
    sizeBytes: file.sizeBytes,
    mimeType: file.mimeType,
    uploadedByDeviceId: file.uploadedByDeviceId,
    uploadedByDeviceName: file.uploadedByDeviceName,
    recipientDeviceIds: file.recipientDeviceIds || [],
    createdAt: file.createdAt,
  };

  // If specific recipients specified -> emit ONLY to uploader and authorized recipient sockets
  if (file.recipientDeviceIds && file.recipientDeviceIds.length > 0) {
    const allowedDeviceIds = new Set([file.uploadedByDeviceId, ...file.recipientDeviceIds]);
    try {
      const sockets = await io.in(roomChannel).fetchSockets();
      for (const s of sockets) {
        const data = s.data as Partial<AuthenticatedSocketData>;
        if (data.deviceId && allowedDeviceIds.has(data.deviceId)) {
          s.emit("file_shared", payload);
        }
      }
      logger.info(
        { roomCode, fileId: file.fileId, recipientsCount: file.recipientDeviceIds.length },
        "Broadcasted private file_shared event to authorized devices only"
      );
    } catch (err) {
      logger.warn({ err, roomCode, fileId: file.fileId }, "Error broadcasting private file_shared event");
    }
  } else {
    // Room-wide file: broadcast to all participants in channel
    io.to(roomChannel).emit("file_shared", payload);
    logger.info({ roomCode, fileId: file.fileId }, "Broadcasted file_shared event to room");
  }
}

/**
 * Broadcasts file deletion to all authorized participants in the room.
 */
export function broadcastFileDeleted(roomCode: string, fileId: string): void {
  if (!io) return;
  const roomChannel = `room:${roomCode}`;
  io.to(roomChannel).emit("file_deleted", {
    roomCode,
    fileId,
  });
  logger.info({ roomCode, fileId }, "Broadcasted file_deleted event to room");
}

/**
 * Broadcasts an updated sanitized peer list to the room.
 */
export function broadcastDevicesUpdated(
  roomCode: string,
  devices: Array<Omit<IRoomDevice, "deviceToken">>
): void {
  if (!io) return;
  const roomChannel = `room:${roomCode}`;
  io.to(roomChannel).emit("devices_updated", {
    roomCode,
    devices,
  });
}

/**
 * Disconnects a removed device immediately from the Socket.IO server,
 * notifies that device with a device_removed message, and updates the room.
 */
export async function handleDeviceRemoved(
  roomCode: string,
  targetDeviceId: string,
  targetDeviceName: string,
  updatedDevices: Array<Omit<IRoomDevice, "deviceToken">>
): Promise<void> {
  if (!io) return;
  const roomChannel = `room:${roomCode}`;

  // 1. Find all sockets associated with target device in this room
  try {
    const sockets = await io.in(roomChannel).fetchSockets();
    for (const s of sockets) {
      const data = s.data as Partial<AuthenticatedSocketData>;
      if (data.deviceId === targetDeviceId) {
        s.emit("device_removed", {
          roomCode,
          deviceId: targetDeviceId,
          message: "The host removed your device from this room.",
        });
        s.leave(roomChannel);
        delete (s.data as any).deviceId;
        delete (s.data as any).deviceToken;
        delete (s.data as any).roomCode;
        s.disconnect(true);
        logger.info(
          { socketId: s.id, roomCode, deviceId: targetDeviceId },
          "Disconnected removed device socket"
        );
      }
    }
  } catch (err) {
    logger.warn({ err, roomCode, targetDeviceId }, "Error fetching sockets for removed device");
  }

  // 2. Broadcast to all remaining peers in the room
  io.to(roomChannel).emit("peer_left", {
    deviceId: targetDeviceId,
    deviceName: targetDeviceName,
    leftAt: new Date(),
    reason: "removed_by_host",
  });

  io.to(roomChannel).emit("devices_updated", {
    roomCode,
    devices: updatedDevices,
  });

  logger.info(
    { roomCode, targetDeviceId },
    "Broadcasted device removal and updated peers"
  );
}

/**
 * Handles a device leaving a room voluntarily.
 * Disconnects socket for the departing device, broadcasts peer_left and devices_updated to remaining peers.
 */
export async function handleDeviceVoluntaryLeave(
  roomCode: string,
  leavingDeviceId: string,
  leavingDeviceName: string,
  updatedDevices: Array<Omit<IRoomDevice, "deviceToken">>,
  isRoomClosed: boolean = false
): Promise<void> {
  if (!io) return;
  const roomChannel = `room:${roomCode}`;

  // 1. Find and disconnect sockets belonging to departing device
  try {
    const sockets = await io.in(roomChannel).fetchSockets();
    for (const s of sockets) {
      const data = s.data as Partial<AuthenticatedSocketData>;
      if (data.deviceId === leavingDeviceId) {
        s.leave(roomChannel);
        delete (s.data as any).deviceId;
        delete (s.data as any).deviceToken;
        delete (s.data as any).roomCode;
        s.disconnect(true);
      }
    }
  } catch (err) {
    logger.warn({ err, roomCode, leavingDeviceId }, "Error disconnecting leaving device sockets");
  }

  // 2. If room closed -> notify room
  if (isRoomClosed) {
    io.to(roomChannel).emit("room_closed", {
      roomCode,
      reason: "closed",
    });
    return;
  }

  // 3. Broadcast peer_left and devices_updated to remaining room members
  io.to(roomChannel).emit("peer_left", {
    deviceId: leavingDeviceId,
    deviceName: leavingDeviceName,
    leftAt: new Date(),
    reason: "voluntary_leave",
  });

  io.to(roomChannel).emit("devices_updated", {
    roomCode,
    devices: updatedDevices,
  });

  logger.info({ roomCode, leavingDeviceId }, "Broadcasted voluntary departure and updated peers");
}

/**
 * Broadcasts room expiration or closure to all participants.
 */
export function broadcastRoomClosed(roomCode: string, reason: "expired" | "closed" = "closed"): void {
  if (!io) return;
  const roomChannel = `room:${roomCode}`;
  io.to(roomChannel).emit("room_closed", {
    roomCode,
    reason,
  });
}

export function getSocketServer(): Server | null {
  return io;
}

export function closeSocketServer(): void {
  if (io) {
    io.close();
    io = null;
    logger.info("Socket.IO server closed");
  }
}
