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
  });

  socket.data = {};
}

/**
 * Broadcasts a newly committed file to all authorized participants in the room.
 */
export function broadcastFileShared(roomCode: string, file: IRoomFile): void {
  if (!io) return;
  const roomChannel = `room:${roomCode}`;
  io.to(roomChannel).emit("file_shared", {
    fileId: file.fileId,
    fileName: file.fileName,
    sizeBytes: file.sizeBytes,
    mimeType: file.mimeType,
    uploadedByDeviceId: file.uploadedByDeviceId,
    uploadedByDeviceName: file.uploadedByDeviceName,
    createdAt: file.createdAt,
  });
  logger.info({ roomCode, fileId: file.fileId }, "Broadcasted file_shared event to room");
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
