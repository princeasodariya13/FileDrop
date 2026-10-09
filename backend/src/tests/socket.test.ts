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

  it("broadcasts file_deleted in real-time to all peers when a file is deleted", async () => {
    // 1. Host creates room & connects socket
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Mac" }),
    });
    const hostData = ((await createRes.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } }).data;
    const hostSocket = createClientSocket({
      roomCode: hostData.roomCode,
      deviceId: hostData.deviceId,
      deviceToken: hostData.deviceToken,
    });
    await new Promise((r) => hostSocket.on("room_joined", r));

    // 2. Peer joins & connects socket
    const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer iPhone" }),
    });
    const peerData = ((await joinRes.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } }).data;
    const peerSocket = createClientSocket({
      roomCode: peerData.roomCode,
      deviceId: peerData.deviceId,
      deviceToken: peerData.deviceToken,
    });
    await new Promise((r) => peerSocket.on("room_joined", r));

    // 3. Create and attach file
    const file = await FileModel.create({
      fileId: "socket-del-file",
      originalName: "shared.pdf",
      sanitizedName: "shared.pdf",
      sizeBytes: 1024,
      mimeType: "application/pdf",
      storageKey: "files/socket-del-file/shared.pdf",
      possessionToken: "token-socket-del",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      inactivityTimerStartsAt: new Date(),
    });

    await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": hostData.deviceId,
        "x-device-token": hostData.deviceToken,
      },
      body: JSON.stringify({ fileId: file.fileId, possessionToken: file.possessionToken }),
    });

    // 4. Peer listens for file_deleted event
    const peerDeletedPromise = new Promise<{ fileId: string; roomCode: string }>((resolve) => {
      peerSocket.on("file_deleted", (payload) => resolve(payload));
    });

    // 5. Host deletes file via REST API
    await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files/${file.fileId}`, {
      method: "DELETE",
      headers: {
        "x-device-id": hostData.deviceId,
        "x-device-token": hostData.deviceToken,
      },
    });

    const deletedEvent = await peerDeletedPromise;
    expect(deletedEvent.fileId).toBe("socket-del-file");
    expect(deletedEvent.roomCode).toBe(hostData.roomCode);
  });

  it("disconnects removed device immediately and blocks reconnection with revoked credentials", async () => {
    // 1. Host creates room & connects
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Mac" }),
    });
    const hostData = ((await createRes.json()) as any).data;
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
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Bad Peer" }),
    });
    const peerData = ((await joinRes.json()) as any).data;
    const peerSocket = createClientSocket({
      roomCode: peerData.roomCode,
      deviceId: peerData.deviceId,
      deviceToken: peerData.deviceToken,
    });
    await new Promise((r) => peerSocket.on("room_joined", r));

    // 3. Set up listener on peer for device_removed and disconnect
    const peerRemovedPromise = new Promise<{ message?: string }>((resolve) => {
      peerSocket.on("device_removed", (payload) => resolve(payload));
    });

    const hostPeerLeftPromise = new Promise<{ deviceId: string; reason?: string }>((resolve) => {
      hostSocket.on("peer_left", (payload) => resolve(payload));
    });

    // 4. Host removes peer via DELETE /api/rooms/:code/devices/:deviceId
    const removeRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/devices/${peerData.deviceId}`, {
      method: "DELETE",
      headers: {
        "x-device-id": hostData.deviceId,
        "x-device-token": hostData.deviceToken,
      },
    });
    expect(removeRes.status).toBe(200);

    // Verify peer receives device_removed and is disconnected
    const removedPayload = await peerRemovedPromise;
    expect(removedPayload.message).toContain("removed");

    const peerLeftPayload = await hostPeerLeftPromise;
    expect(peerLeftPayload.deviceId).toBe(peerData.deviceId);
    expect(peerLeftPayload.reason).toBe("removed_by_host");

    // 5. Verify peer cannot reconnect using revoked credentials
    const reconnectSocket = createClientSocket({
      roomCode: peerData.roomCode,
      deviceId: peerData.deviceId,
      deviceToken: peerData.deviceToken,
    });

    const roomErrorPromise = new Promise<{ code?: string }>((resolve) => {
      reconnectSocket.on("room_error", (err) => resolve(err));
    });

    const errorEvent = await roomErrorPromise;
    expect(errorEvent.code).toBe("UNAUTHORIZED");
  });

  it("emits file_shared selectively to authorized recipients and uploader only", async () => {
    // 1. Host creates room & connects socket
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Mac" }),
    });
    const hostData = ((await createRes.json()) as any).data;
    const hostSocket = createClientSocket({
      roomCode: hostData.roomCode,
      deviceId: hostData.deviceId,
      deviceToken: hostData.deviceToken,
    });
    await new Promise((r) => hostSocket.on("room_joined", r));

    // 2. Peer A (uploader) joins & connects
    const joinResA = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer A (Uploader)" }),
    });
    const peerA = ((await joinResA.json()) as any).data;
    const peerSocketA = createClientSocket({
      roomCode: peerA.roomCode,
      deviceId: peerA.deviceId,
      deviceToken: peerA.deviceToken,
    });
    await new Promise((r) => peerSocketA.on("room_joined", r));

    // 3. Peer B (designated recipient) joins & connects
    const joinResB = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer B (Recipient)" }),
    });
    const peerB = ((await joinResB.json()) as any).data;
    const peerSocketB = createClientSocket({
      roomCode: peerB.roomCode,
      deviceId: peerB.deviceId,
      deviceToken: peerB.deviceToken,
    });
    await new Promise((r) => peerSocketB.on("room_joined", r));

    // 4. Peer C (unauthorized) joins & connects
    const joinResC = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer C (Unauthorized)" }),
    });
    const peerC = ((await joinResC.json()) as any).data;
    const peerSocketC = createClientSocket({
      roomCode: peerC.roomCode,
      deviceId: peerC.deviceId,
      deviceToken: peerC.deviceToken,
    });
    await new Promise((r) => peerSocketC.on("room_joined", r));

    // 5. Setup event listeners on sockets
    let unauthorizedReceived = false;
    peerSocketC.on("file_shared", () => {
      unauthorizedReceived = true;
    });

    let hostReceived = false;
    hostSocket.on("file_shared", () => {
      hostReceived = true;
    });

    const recipientReceivedPromise = new Promise<any>((resolve) => {
      peerSocketB.on("file_shared", (payload) => resolve(payload));
    });

    const uploaderReceivedPromise = new Promise<any>((resolve) => {
      peerSocketA.on("file_shared", (payload) => resolve(payload));
    });

    // 6. Peer A attaches file designated for Peer B only
    const file = await FileModel.create({
      fileId: "selective-socket-file",
      originalName: "private-photo.png",
      sanitizedName: "private-photo.png",
      sizeBytes: 1024,
      mimeType: "image/png",
      storageKey: "files/selective-socket-file/private-photo.png",
      possessionToken: "token-photo",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      inactivityTimerStartsAt: new Date(),
    });

    await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": peerA.deviceId,
        "x-device-token": peerA.deviceToken,
      },
      body: JSON.stringify({
        fileId: file.fileId,
        possessionToken: file.possessionToken,
        recipientDeviceIds: [peerB.deviceId],
      }),
    });

    // 7. Verify Peer B and Peer A received the event
    const recipientPayload = await recipientReceivedPromise;
    expect(recipientPayload.fileId).toBe("selective-socket-file");
    expect(recipientPayload.recipientDeviceIds).toEqual([peerB.deviceId]);

    const uploaderPayload = await uploaderReceivedPromise;
    expect(uploaderPayload.fileId).toBe("selective-socket-file");

    // Wait a brief tick to ensure no events leaked to unauthorized sockets
    await new Promise((r) => setTimeout(r, 200));
    expect(unauthorizedReceived).toBe(false);
    expect(hostReceived).toBe(false);
  });

  it("broadcasts peer_left with voluntary_leave reason and updates remaining peers upon voluntary departure", async () => {
    // 1. Host creates room & connects
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Mac" }),
    });
    const hostData = ((await createRes.json()) as any).data;
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
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Leaving Peer" }),
    });
    const peerData = ((await joinRes.json()) as any).data;
    const peerSocket = createClientSocket({
      roomCode: peerData.roomCode,
      deviceId: peerData.deviceId,
      deviceToken: peerData.deviceToken,
    });
    await new Promise((r) => peerSocket.on("room_joined", r));

    // 3. Setup listeners on host socket for peer_left and devices_updated
    const hostPeerLeftPromise = new Promise<any>((resolve) => {
      hostSocket.on("peer_left", (payload) => resolve(payload));
    });

    const hostDevicesUpdatedPromise = new Promise<any>((resolve) => {
      hostSocket.on("devices_updated", (payload) => resolve(payload));
    });

    // 4. Peer leaves voluntarily
    const leaveRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/leave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": peerData.deviceId,
        "x-device-token": peerData.deviceToken,
      },
      body: JSON.stringify({ deviceId: peerData.deviceId }),
    });
    expect(leaveRes.status).toBe(200);

    // 5. Host receives peer_left with voluntary_leave reason
    const leftPayload = await hostPeerLeftPromise;
    expect(leftPayload.deviceId).toBe(peerData.deviceId);
    expect(leftPayload.reason).toBe("voluntary_leave");

    // 6. Host receives devices_updated with 1 device remaining
    const updatedPayload = await hostDevicesUpdatedPromise;
    expect(updatedPayload.devices.length).toBe(1);
    expect(updatedPayload.devices[0].deviceId).toBe(hostData.deviceId);
  });
});
