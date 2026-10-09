import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import { RoomModel } from "@/models/Room.model";
import { FileModel } from "@/models/File.model";
import { createApp } from "@/app";
import { initSocketServer, closeSocketServer } from "@/services/socket.service";

let mongod: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;
const openSockets: ClientSocket[] = [];

function createClientSocket(auth?: { roomCode?: string; deviceId?: string; deviceToken?: string }): ClientSocket {
  const socket = ioClient(baseUrl, {
    auth,
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  openSockets.push(socket);
  return socket;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = createApp();
  server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
}, 300000);

afterAll(async () => {
  for (const s of openSockets) {
    if (s.connected) s.disconnect();
  }
  closeSocketServer();
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
}, 300000);

beforeEach(async () => {
  for (const s of openSockets) {
    if (s.connected) s.disconnect();
  }
  openSockets.length = 0;
  await RoomModel.deleteMany({});
  await FileModel.deleteMany({});
});

describe("Real-Time Multi-Device Socket.IO Layer", () => {
  it("authenticates and authorizes a valid device session", async () => {
    // 1. Create a room via REST API
    const res = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Mac", deviceType: "desktop" }),
    });
    const { data } = (await res.json()) as {
      data: { roomCode: string; deviceId: string; deviceToken: string };
    };

    // 2. Connect socket with authorized credentials
    const socket = createClientSocket({
      roomCode: data.roomCode,
      deviceId: data.deviceId,
      deviceToken: data.deviceToken,
    });

    const joinedPromise = new Promise<{ roomCode: string; deviceId: string }>((resolve) => {
      socket.on("room_joined", (payload) => resolve(payload));
    });

    const joined = await joinedPromise;
    expect(joined.roomCode).toBe(data.roomCode);
    expect(joined.deviceId).toBe(data.deviceId);
  });

  it("rejects unauthorized connection with invalid device token", async () => {
    // 1. Create a room
    const res = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host PC" }),
    });
    const { data } = (await res.json()) as { data: { roomCode: string; deviceId: string } };

    // 2. Connect with bogus token
    const socket = createClientSocket({
      roomCode: data.roomCode,
      deviceId: data.deviceId,
      deviceToken: "fake-invalid-token",
    });

    const errorPromise = new Promise<{ code: string }>((resolve) => {
      socket.on("room_error", (err) => resolve(err));
    });

    const error = await errorPromise;
    expect(error.code).toBe("UNAUTHORIZED");
  });

  it("broadcasts peer_joined event when a second device joins the room", async () => {
    // 1. Host creates room
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "MacBook", deviceType: "desktop" }),
    });
    const hostData = ((await createRes.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } }).data;

    // 2. Host connects socket
    const hostSocket = createClientSocket({
      roomCode: hostData.roomCode,
      deviceId: hostData.deviceId,
      deviceToken: hostData.deviceToken,
    });
    await new Promise((r) => hostSocket.on("room_joined", r));

    // 3. Set up listener on Host for peer_joined
    const peerJoinedPromise = new Promise<{ deviceId: string; deviceName: string; deviceToken?: string }>((resolve) => {
      hostSocket.on("peer_joined", (payload) => resolve(payload));
    });

    // 4. Peer joins room via REST and connects socket
    const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "iPhone 15", deviceType: "mobile" }),
    });
    const peerData = ((await joinRes.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } }).data;

    const peerSocket = createClientSocket({
      roomCode: peerData.roomCode,
      deviceId: peerData.deviceId,
      deviceToken: peerData.deviceToken,
    });
    await new Promise((r) => peerSocket.on("room_joined", r));

    const peerJoined = await peerJoinedPromise;
    expect(peerJoined.deviceId).toBe(peerData.deviceId);
    expect(peerJoined.deviceName).toBe("iPhone 15");
    // Ensure deviceToken is NEVER leaked in broadcast events
    expect(peerJoined.deviceToken).toBeUndefined();
  });

  it("maintains room isolation: events in Room A do not leak to Room B", async () => {
    // 1. Create Room A & connect Device A
    const resA = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Device A" }),
    });
    const dataA = ((await resA.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } }).data;
    const socketA = createClientSocket({
      roomCode: dataA.roomCode,
      deviceId: dataA.deviceId,
      deviceToken: dataA.deviceToken,
    });
    await new Promise((r) => socketA.on("room_joined", r));

    // 2. Create Room B & connect Device B
    const resB = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Device B" }),
    });
    const dataB = ((await resB.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } }).data;
    const socketB = createClientSocket({
      roomCode: dataB.roomCode,
      deviceId: dataB.deviceId,
      deviceToken: dataB.deviceToken,
    });
    await new Promise((r) => socketB.on("room_joined", r));

    let leakedEvent = false;
    socketB.on("peer_joined", () => {
      leakedEvent = true;
    });

    // 3. Join a second device to Room A only
    const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: dataA.roomCode, deviceName: "Device A2" }),
    });
    const dataA2 = ((await joinRes.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } }).data;
    const socketA2 = createClientSocket({
      roomCode: dataA2.roomCode,
      deviceId: dataA2.deviceId,
      deviceToken: dataA2.deviceToken,
    });
    await new Promise((r) => socketA2.on("room_joined", r));

    // Wait briefly to ensure no leaked events
    await new Promise((r) => setTimeout(r, 200));
    expect(leakedEvent).toBe(false);
  });

  it("broadcasts file_shared event in real-time when a file is attached to the room", async () => {
    // 1. Create a dummy file in FileModel
    const dummyFile = await FileModel.create({
      fileId: "rt-file-12345",
      code: "123456",
      originalName: "financial-report.xlsx",
      sanitizedName: "financial-report.xlsx",
      sizeBytes: 204800,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      storageKey: "files/rt-file-12345/financial-report.xlsx",
      possessionToken: "owner-token-123",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      inactivityTimerStartsAt: new Date(),
    });

    // 2. Create room and connect Host socket
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Workstation" }),
    });
    const { data } = ((await createRes.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } });

    const hostSocket = createClientSocket({
      roomCode: data.roomCode,
      deviceId: data.deviceId,
      deviceToken: data.deviceToken,
    });
    await new Promise((r) => hostSocket.on("room_joined", r));

    // 3. Set up listener for file_shared
    const fileSharedPromise = new Promise<{ fileId: string; fileName: string; sizeBytes: number; uploadedByDeviceName: string }>((resolve) => {
      hostSocket.on("file_shared", (payload) => resolve(payload));
    });

    // 4. Attach file via REST API
    await fetch(`${baseUrl}/api/rooms/${data.roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": data.deviceId,
      },
      body: JSON.stringify({ fileId: dummyFile.fileId, possessionToken: "owner-token-123" }),
    });

    const fileEvent = await fileSharedPromise;
    expect(fileEvent.fileId).toBe("rt-file-12345");
    expect(fileEvent.fileName).toBe("financial-report.xlsx");
    expect(fileEvent.sizeBytes).toBe(204800);
    expect(fileEvent.uploadedByDeviceName).toBe("Host Workstation");
  });

  it("broadcasts peer_left when a device disconnects", async () => {
    // 1. Host creates room & connects
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host" }),
    });
    const hostData = ((await createRes.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } }).data;
    const hostSocket = createClientSocket({
      roomCode: hostData.roomCode,
      deviceId: hostData.deviceId,
      deviceToken: hostData.deviceToken,
    });
    await new Promise((r) => hostSocket.on("room_joined", r));

    // 2. Peer joins & connects
    const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer Device" }),
    });
    const peerData = ((await joinRes.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } }).data;
    const peerSocket = createClientSocket({
      roomCode: peerData.roomCode,
      deviceId: peerData.deviceId,
      deviceToken: peerData.deviceToken,
    });
    await new Promise((r) => peerSocket.on("room_joined", r));

    // 3. Set up peer_left listener on Host
    const peerLeftPromise = new Promise<{ deviceId: string }>((resolve) => {
      hostSocket.on("peer_left", (payload) => resolve(payload));
    });

    // 4. Peer disconnects
    peerSocket.disconnect();

    const peerLeft = await peerLeftPromise;
    expect(peerLeft.deviceId).toBe(peerData.deviceId);
  });
});
