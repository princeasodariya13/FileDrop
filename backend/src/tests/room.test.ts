import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { RoomModel } from "@/models/Room.model";
import { FileModel } from "@/models/File.model";
import { createApp } from "@/app";

let mongod: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
}, 300000);

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
}, 300000);

beforeEach(async () => {
  await RoomModel.deleteMany({});
  await FileModel.deleteMany({});
});

describe("Connect Devices Room Endpoints & Foundation", () => {
  it("POST /api/rooms/create — creates a new room with a secure 6-digit code and host device", async () => {
    const res = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "MacBook Pro", deviceType: "desktop" }),
    });

    const json = (await res.json()) as {
      success: boolean;
      data: {
        roomCode: string;
        roomId: string;
        deviceId: string;
        deviceToken: string;
        status: string;
        devices: Array<{ isHost: boolean; deviceName: string; deviceType: string; deviceToken?: string }>;
        files: unknown[];
      };
    };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.roomCode).toMatch(/^\d{6}$/);
    expect(json.data.roomId).toBeDefined();
    expect(json.data.deviceId).toBeDefined();
    expect(json.data.deviceToken).toBeDefined();
    expect(json.data.status).toBe("active");
    expect(json.data.devices.length).toBe(1);
    expect(json.data.devices[0].isHost).toBe(true);
    expect(json.data.devices[0].deviceName).toBe("MacBook Pro");
    expect(json.data.devices[0].deviceType).toBe("desktop");
    // Ensure deviceToken is not leaked in the public devices array
    expect(json.data.devices[0].deviceToken).toBeUndefined();
  });

  it("POST /api/rooms/join — allows a second device to join via 6-digit code", async () => {
    // 1. Host creates room
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Laptop", deviceType: "desktop" }),
    });
    const createJson = (await createRes.json()) as { data: { roomCode: string } };
    const { roomCode } = createJson.data;

    // 2. Peer joins room
    const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: roomCode, deviceName: "iPhone 15", deviceType: "mobile" }),
    });

    const joinJson = (await joinRes.json()) as {
      success: boolean;
      data: {
        roomCode: string;
        isHost: boolean;
        devices: Array<{ deviceName: string }>;
      };
    };

    expect(joinRes.status).toBe(200);
    expect(joinJson.success).toBe(true);
    expect(joinJson.data.roomCode).toBe(roomCode);
    expect(joinJson.data.isHost).toBe(false);
    expect(joinJson.data.devices.length).toBe(2);
    expect(joinJson.data.devices.map((d) => d.deviceName)).toContain("iPhone 15");
  });

  it("POST /api/rooms/join — rejects invalid or expired room codes with 404", async () => {
    const res = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "999999", deviceName: "Unknown" }),
    });

    const json = (await res.json()) as { success: boolean; error: { code: string } };

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("ROOM_NOT_FOUND");
  });

  it("GET /api/rooms/:code — returns active room state and devices", async () => {
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host PC", deviceType: "desktop" }),
    });
    const createJson = (await createRes.json()) as { data: { roomCode: string; deviceId: string } };
    const { roomCode, deviceId } = createJson.data;

    const getRes = await fetch(`${baseUrl}/api/rooms/${roomCode}`, {
      headers: { "x-device-id": deviceId },
    });

    const getJson = (await getRes.json()) as {
      data: { roomCode: string; status: string; devices: unknown[] };
    };

    expect(getRes.status).toBe(200);
    expect(getJson.data.roomCode).toBe(roomCode);
    expect(getJson.data.status).toBe("active");
    expect(getJson.data.devices.length).toBe(1);
  });

  it("POST /api/rooms/:code/files — attaches an uploaded active file and prevents duplicates", async () => {
    // 1. Create a dummy file in FileModel
    const dummyFile = await FileModel.create({
      fileId: "testfile1234",
      code: "123456",
      originalName: "presentation.pdf",
      sanitizedName: "presentation.pdf",
      sizeBytes: 1048576,
      mimeType: "application/pdf",
      storageKey: "files/testfile1234/presentation.pdf",
      possessionToken: "token-secret-abc",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      inactivityTimerStartsAt: new Date(),
    });

    // 2. Create room
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Device" }),
    });
    const createJson = (await createRes.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } };
    const { roomCode, deviceId, deviceToken } = createJson.data;

    // 3. Attach file to room with valid device tokens
    const addFileRes = await fetch(`${baseUrl}/api/rooms/${roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
        "x-device-token": deviceToken,
      },
      body: JSON.stringify({ fileId: dummyFile.fileId, possessionToken: "token-secret-abc" }),
    });

    const addFileJson = (await addFileRes.json()) as {
      data: {
        files: Array<{ fileId: string; fileName: string; uploadedByDeviceName: string }>;
      };
    };

    expect(addFileRes.status).toBe(200);
    expect(addFileJson.data.files.length).toBe(1);
    expect(addFileJson.data.files[0].fileId).toBe("testfile1234");
    expect(addFileJson.data.files[0].fileName).toBe("presentation.pdf");
    expect(addFileJson.data.files[0].uploadedByDeviceName).toBe("Host Device");

    // 4. Duplicate attachment attempt — should NOT duplicate entry
    const dupRes = await fetch(`${baseUrl}/api/rooms/${roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
        "x-device-token": deviceToken,
      },
      body: JSON.stringify({ fileId: dummyFile.fileId, possessionToken: "token-secret-abc" }),
    });
    const dupJson = (await dupRes.json()) as { data: { files: unknown[] } };
    expect(dupJson.data.files.length).toBe(1);

    // 5. Verify GET /api/rooms/:code/files
    const listFilesRes = await fetch(`${baseUrl}/api/rooms/${roomCode}/files`);
    const listFilesJson = (await listFilesRes.json()) as { data: { files: unknown[] } };

    expect(listFilesRes.status).toBe(200);
    expect(listFilesJson.data.files.length).toBe(1);
  });

  it("POST /api/rooms/:code/files — rejects attachment with invalid device token or non-existent file", async () => {
    // 1. Create room
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Device" }),
    });
    const { roomCode, deviceId } = ((await createRes.json()) as { data: { roomCode: string; deviceId: string } }).data;

    // 2. Reject mismatched device token
    const rejectTokenRes = await fetch(`${baseUrl}/api/rooms/${roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
        "x-device-token": "wrong-token-12345",
      },
      body: JSON.stringify({ fileId: "nonexistent-file-id" }),
    });
    expect(rejectTokenRes.status).toBe(401);

    // 3. Reject non-existent file in FileModel
    const rejectFileRes = await fetch(`${baseUrl}/api/rooms/${roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileId: "nonexistent-file-id" }),
    });
    expect(rejectFileRes.status).toBe(404);
  });

  it("POST /api/rooms/:code/files/:fileId/download — generates presigned download URL for authorized room file", async () => {
    // 1. Create file in FileModel
    const file = await FileModel.create({
      fileId: "dl-file-123",
      code: "654321",
      originalName: "project-specs.docx",
      sanitizedName: "project-specs.docx",
      sizeBytes: 524288,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      storageKey: "files/dl-file-123/project-specs.docx",
      possessionToken: "owner-token-dl",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      inactivityTimerStartsAt: new Date(),
    });

    // 2. Create room and attach file
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Laptop" }),
    });
    const { roomCode, deviceId, deviceToken } = ((await createRes.json()) as { data: { roomCode: string; deviceId: string; deviceToken: string } }).data;

    await fetch(`${baseUrl}/api/rooms/${roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
        "x-device-token": deviceToken,
      },
      body: JSON.stringify({ fileId: file.fileId, possessionToken: "owner-token-dl" }),
    });

    // 3. Download room file
    const dlRes = await fetch(`${baseUrl}/api/rooms/${roomCode}/files/${file.fileId}/download`, {
      method: "POST",
      headers: {
        "x-device-id": deviceId,
        "x-device-token": deviceToken,
      },
    });

    const dlJson = (await dlRes.json()) as {
      success: boolean;
      data: {
        downloadUrl: string;
        fileName: string;
        sizeBytes: number;
        mimeType: string;
        sessionId: string;
      };
    };

    expect(dlRes.status).toBe(200);
    expect(dlJson.success).toBe(true);
    expect(dlJson.data.downloadUrl).toBeDefined();
    expect(dlJson.data.fileName).toBe("project-specs.docx");
    expect(dlJson.data.sessionId).toBeDefined();

    // 4. Reject download of file not in this room
    const rejectDl = await fetch(`${baseUrl}/api/rooms/${roomCode}/files/other-file-999/download`, {
      method: "POST",
      headers: {
        "x-device-id": deviceId,
        "x-device-token": deviceToken,
      },
    });
    expect(rejectDl.status).toBe(404);
  });

  it("synchronizes room files and prunes expired files on retrieval", async () => {
    // 1. Create 2 files (1 active, 1 expired)
    const activeFile = await FileModel.create({
      fileId: "sync-active-file",
      originalName: "active.txt",
      sanitizedName: "active.txt",
      sizeBytes: 1024,
      mimeType: "text/plain",
      storageKey: "files/sync-active-file/active.txt",
      possessionToken: "token-active",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      inactivityTimerStartsAt: new Date(),
    });

    const expiredFile = await FileModel.create({
      fileId: "sync-expired-file",
      originalName: "expired.txt",
      sanitizedName: "expired.txt",
      sizeBytes: 1024,
      mimeType: "text/plain",
      storageKey: "files/sync-expired-file/expired.txt",
      possessionToken: "token-expired",
      status: "expired", // marked expired
      expiresAt: new Date(Date.now() - 1000),
      inactivityTimerStartsAt: new Date(),
    });

    // 2. Create room with both files initially in DB
    const room = await RoomModel.create({
      roomId: "syncroom123",
      roomCode: "777888",
      hostDeviceId: "devHost",
      status: "active",
      devices: [{ deviceId: "devHost", deviceToken: "tok1", deviceName: "Host", deviceType: "desktop" }],
      files: [
        { fileId: activeFile.fileId, fileName: "active.txt", sizeBytes: 1024, mimeType: "text/plain", uploadedByDeviceId: "devHost", uploadedByDeviceName: "Host", createdAt: new Date() },
        { fileId: expiredFile.fileId, fileName: "expired.txt", sizeBytes: 1024, mimeType: "text/plain", uploadedByDeviceId: "devHost", uploadedByDeviceName: "Host", createdAt: new Date() },
      ],
      expiresAt: new Date(Date.now() + 3600000),
    });

    // 3. New participant joins room
    const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: room.roomCode, deviceName: "Joining Mobile" }),
    });
    const joinJson = (await joinRes.json()) as { data: { files: Array<{ fileId: string }> } };

    // Synced files should only include active unexpired files
    expect(joinJson.data.files.length).toBe(1);
    expect(joinJson.data.files[0].fileId).toBe("sync-active-file");
  });

  it("Quick Share regression check — existing file code lookup and info remain functional", async () => {
    const quickFile = await FileModel.create({
      fileId: "quick-share-file-1",
      code: "112233",
      originalName: "quick-guide.pdf",
      sanitizedName: "quick-guide.pdf",
      sizeBytes: 20480,
      mimeType: "application/pdf",
      storageKey: "files/quick-share-file-1/quick-guide.pdf",
      possessionToken: "token-quick",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      inactivityTimerStartsAt: new Date(),
    });

    // 1. GET /api/files/:fileId
    const infoRes = await fetch(`${baseUrl}/api/files/${quickFile.fileId}`);
    const infoJson = (await infoRes.json()) as { success: boolean; data: { fileName: string; code: string } };
    expect(infoRes.status).toBe(200);
    expect(infoJson.success).toBe(true);
    expect(infoJson.data.fileName).toBe("quick-guide.pdf");
    expect(infoJson.data.code).toBe("112233");

    // 2. GET /api/files/code/:code
    const codeRes = await fetch(`${baseUrl}/api/files/code/112233`);
    const codeJson = (await codeRes.json()) as { success: boolean; data: { fileName: string; fileId: string } };
    expect(codeRes.status).toBe(200);
    expect(codeJson.success).toBe(true);
    expect(codeJson.data.fileName).toBe("quick-guide.pdf");
    expect(codeJson.data.fileId).toBe(quickFile.fileId);
  });

  it("sweepExpiredRooms — marks expired rooms as expired", async () => {
    const { sweepExpiredRooms } = await import("@/jobs/cleanup.job");

    await RoomModel.create({
      roomId: "oldroom12345",
      roomCode: "555666",
      hostDeviceId: "dev1",
      status: "active",
      devices: [],
      files: [],
      expiresAt: new Date(Date.now() - 1000), // in the past
      lastActivityAt: new Date(Date.now() - 1000),
    });

    const sweptCount = await sweepExpiredRooms();
    expect(sweptCount).toBe(1);

    const room = await RoomModel.findOne({ roomCode: "555666" });
    expect(room?.status).toBe("expired");
  });

  it("DELETE /api/rooms/:code/files/:fileId — allows device to delete its own file", async () => {
    // 1. Create room
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Mac", deviceType: "desktop" }),
    });
    const { data: roomData } = (await createRes.json()) as any;

    // 2. Add file
    const file = await FileModel.create({
      fileId: "del-test-file-1",
      originalName: "to-delete.pdf",
      sanitizedName: "to-delete.pdf",
      sizeBytes: 1024,
      mimeType: "application/pdf",
      storageKey: "files/del-test-file-1/to-delete.pdf",
      possessionToken: "token-del",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      inactivityTimerStartsAt: new Date(),
    });

    await fetch(`${baseUrl}/api/rooms/${roomData.roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": roomData.deviceId,
        "x-device-token": roomData.deviceToken,
      },
      body: JSON.stringify({ fileId: file.fileId, possessionToken: file.possessionToken }),
    });

    // 3. Delete file as owner
    const delRes = await fetch(`${baseUrl}/api/rooms/${roomData.roomCode}/files/${file.fileId}`, {
      method: "DELETE",
      headers: {
        "x-device-id": roomData.deviceId,
        "x-device-token": roomData.deviceToken,
      },
    });

    const delJson = (await delRes.json()) as any;
    expect(delRes.status).toBe(200);
    expect(delJson.success).toBe(true);
    expect(delJson.data.fileId).toBe(file.fileId);

    // Verify room no longer has the file
    const updatedRoom = await RoomModel.findOne({ roomCode: roomData.roomCode });
    expect(updatedRoom?.files.length).toBe(0);
  });

  it("DELETE /api/rooms/:code/files/:fileId — rejects deletion when attempted by a different device (403)", async () => {
    // 1. Create room
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Mac", deviceType: "desktop" }),
    });
    const { data: hostData } = (await createRes.json()) as any;

    // 2. Peer joins
    const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer Phone", deviceType: "mobile" }),
    });
    const { data: peerData } = (await joinRes.json()) as any;

    // 3. Host adds file
    const file = await FileModel.create({
      fileId: "host-file-99",
      originalName: "host-confidential.pdf",
      sanitizedName: "host-confidential.pdf",
      sizeBytes: 1024,
      mimeType: "application/pdf",
      storageKey: "files/host-file-99/host-confidential.pdf",
      possessionToken: "token-host",
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

    // 4. Peer attempts to delete host's file -> should fail with 403 Forbidden
    const delRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files/${file.fileId}`, {
      method: "DELETE",
      headers: {
        "x-device-id": peerData.deviceId,
        "x-device-token": peerData.deviceToken,
      },
    });

    expect(delRes.status).toBe(403);
    const delJson = (await delRes.json()) as any;
    expect(delJson.success).toBe(false);
    expect(delJson.error.code).toBe("FORBIDDEN");

    // Verify file is still in room
    const room = await RoomModel.findOne({ roomCode: hostData.roomCode });
    expect(room?.files.length).toBe(1);
  });

  it("DELETE /api/rooms/:code/files/:fileId — rejects unauthorized and cross-room deletion", async () => {
    // 1. Room A
    const resA = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Device A" }),
    });
    const { data: dataA } = (await resA.json()) as any;

    // 2. Room B
    const resB = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Device B" }),
    });
    const { data: dataB } = (await resB.json()) as any;

    // Add file to Room A
    const file = await FileModel.create({
      fileId: "room-a-file",
      originalName: "a.txt",
      sanitizedName: "a.txt",
      sizeBytes: 100,
      mimeType: "text/plain",
      storageKey: "files/room-a-file/a.txt",
      possessionToken: "token-a",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      inactivityTimerStartsAt: new Date(),
    });
    await fetch(`${baseUrl}/api/rooms/${dataA.roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": dataA.deviceId,
        "x-device-token": dataA.deviceToken,
      },
      body: JSON.stringify({ fileId: file.fileId, possessionToken: file.possessionToken }),
    });

    // Attempt deletion from Room B using Room A file ID -> 404
    const crossRes = await fetch(`${baseUrl}/api/rooms/${dataB.roomCode}/files/${file.fileId}`, {
      method: "DELETE",
      headers: {
        "x-device-id": dataB.deviceId,
        "x-device-token": dataB.deviceToken,
      },
    });
    expect(crossRes.status).toBe(404);

    // Attempt deletion without auth tokens -> 401
    const noAuthRes = await fetch(`${baseUrl}/api/rooms/${dataA.roomCode}/files/${file.fileId}`, {
      method: "DELETE",
    });
    expect(noAuthRes.status).toBe(401);
  });

  it("DELETE /api/rooms/:code/devices/:deviceId — allows room host to remove another connected device", async () => {
    // 1. Host creates room
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Mac", deviceType: "desktop" }),
    });
    const { data: hostData } = (await createRes.json()) as any;

    // 2. Peer joins
    const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer Phone", deviceType: "mobile" }),
    });
    const { data: peerData } = (await joinRes.json()) as any;

    // Verify room has 2 devices
    let room = await RoomModel.findOne({ roomCode: hostData.roomCode });
    expect(room?.devices.length).toBe(2);

    // 3. Host removes peer device
    const removeRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/devices/${peerData.deviceId}`, {
      method: "DELETE",
      headers: {
        "x-device-id": hostData.deviceId,
        "x-device-token": hostData.deviceToken,
      },
    });

    const removeJson = (await removeRes.json()) as any;
    expect(removeRes.status).toBe(200);
    expect(removeJson.success).toBe(true);
    expect(removeJson.data.removedDeviceId).toBe(peerData.deviceId);
    expect(removeJson.data.devices.length).toBe(1);

    // Verify DB state
    room = await RoomModel.findOne({ roomCode: hostData.roomCode });
    expect(room?.devices.length).toBe(1);
    expect(room?.devices[0].deviceId).toBe(hostData.deviceId);
  });

  it("DELETE /api/rooms/:code/devices/:deviceId — rejects removal when attempted by non-host or self-removal", async () => {
    // 1. Host creates room
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Mac", deviceType: "desktop" }),
    });
    const { data: hostData } = (await createRes.json()) as any;

    // 2. Peer A joins
    const joinResA = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer A", deviceType: "mobile" }),
    });
    const { data: peerDataA } = (await joinResA.json()) as any;

    // 3. Peer B joins
    const joinResB = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer B", deviceType: "mobile" }),
    });
    const { data: peerDataB } = (await joinResB.json()) as any;

    // Non-host (Peer A) attempts to remove Peer B -> 403 Forbidden
    const nonHostRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/devices/${peerDataB.deviceId}`, {
      method: "DELETE",
      headers: {
        "x-device-id": peerDataA.deviceId,
        "x-device-token": peerDataA.deviceToken,
      },
    });
    expect(nonHostRes.status).toBe(403);

    // Host attempts self-removal -> 400 Bad Request
    const selfRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/devices/${hostData.deviceId}`, {
      method: "DELETE",
      headers: {
        "x-device-id": hostData.deviceId,
        "x-device-token": hostData.deviceToken,
      },
    });
    expect(selfRes.status).toBe(400);

    // Cross-room device removal attempt -> 404 Not Found
    const fakeRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/devices/non-existent-dev`, {
      method: "DELETE",
      headers: {
        "x-device-id": hostData.deviceId,
        "x-device-token": hostData.deviceToken,
      },
    });
    expect(fakeRes.status).toBe(404);
  });

  it("Removing a device preserves shared files and does not delete B2 storage objects", async () => {
    // 1. Host creates room
    const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceName: "Host Mac" }),
    });
    const { data: hostData } = (await createRes.json()) as any;

    // 2. Peer joins & uploads file
    const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer Phone" }),
    });
    const { data: peerData } = (await joinRes.json()) as any;

    const file = await FileModel.create({
      fileId: "peer-preserved-file",
      originalName: "peer-doc.pdf",
      sanitizedName: "peer-doc.pdf",
      sizeBytes: 5000,
      mimeType: "application/pdf",
      storageKey: "files/peer-preserved-file/peer-doc.pdf",
      possessionToken: "token-peer",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000),
      inactivityTimerStartsAt: new Date(),
    });

    await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": peerData.deviceId,
        "x-device-token": peerData.deviceToken,
      },
      body: JSON.stringify({ fileId: file.fileId, possessionToken: file.possessionToken }),
    });

    // 3. Host removes peer device
    await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/devices/${peerData.deviceId}`, {
      method: "DELETE",
      headers: {
        "x-device-id": hostData.deviceId,
        "x-device-token": hostData.deviceToken,
      },
    });

    // 4. Verify file is still active in FileModel and still in RoomModel
    const fileInDb = await FileModel.findOne({ fileId: "peer-preserved-file" });
    expect(fileInDb?.status).toBe("active");

    const room = await RoomModel.findOne({ roomCode: hostData.roomCode });
    expect(room?.files.length).toBe(1);
    expect(room?.files[0].fileId).toBe("peer-preserved-file");
  });

  describe("Recipient Selection & Private File Visibility", () => {
    it("shares with all devices by default when recipientDeviceIds is empty", async () => {
      // 1. Host creates room
      const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: "Host Mac" }),
      });
      const { data: hostData } = (await createRes.json()) as any;

      // 2. Peer A and Peer B join
      const joinResA = await fetch(`${baseUrl}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer A" }),
      });
      const { data: peerA } = (await joinResA.json()) as any;

      const joinResB = await fetch(`${baseUrl}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer B" }),
      });
      const { data: peerB } = (await joinResB.json()) as any;

      // 3. Peer A uploads a room-wide file (no recipientDeviceIds)
      const file = await FileModel.create({
        fileId: "public-room-file",
        originalName: "public-notes.pdf",
        sanitizedName: "public-notes.pdf",
        sizeBytes: 2048,
        mimeType: "application/pdf",
        storageKey: "files/public-room-file/public-notes.pdf",
        possessionToken: "token-pub",
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
        }),
      });

      // 4. Verify Host, Peer A, and Peer B all see the file in GET /api/rooms/:code and GET /api/rooms/:code/files
      const hostFilesRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files`, {
        headers: { "x-device-id": hostData.deviceId },
      });
      const hostFiles = ((await hostFilesRes.json()) as any).data.files;
      expect(hostFiles.some((f: any) => f.fileId === "public-room-file")).toBe(true);

      const peerBFilesRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}`, {
        headers: { "x-device-id": peerB.deviceId },
      });
      const peerBFiles = ((await peerBFilesRes.json()) as any).data.files;
      expect(peerBFiles.some((f: any) => f.fileId === "public-room-file")).toBe(true);
    });

    it("enforces private file visibility: only uploader and designated recipient see metadata and can download", async () => {
      // 1. Host creates room
      const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: "Host Mac" }),
      });
      const { data: hostData } = (await createRes.json()) as any;

      // 2. Peer A (uploader), Peer B (chosen recipient), Peer C (unauthorized) join
      const joinResA = await fetch(`${baseUrl}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer A (Uploader)" }),
      });
      const { data: peerA } = (await joinResA.json()) as any;

      const joinResB = await fetch(`${baseUrl}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer B (Recipient)" }),
      });
      const { data: peerB } = (await joinResB.json()) as any;

      const joinResC = await fetch(`${baseUrl}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer C (Unauthorized)" }),
      });
      const { data: peerC } = (await joinResC.json()) as any;

      // 3. Peer A attaches file designated exclusively for Peer B
      const file = await FileModel.create({
        fileId: "private-secret-file",
        originalName: "confidential.pdf",
        sanitizedName: "confidential.pdf",
        sizeBytes: 4096,
        mimeType: "application/pdf",
        storageKey: "files/private-secret-file/confidential.pdf",
        possessionToken: "token-secret",
        status: "active",
        expiresAt: new Date(Date.now() + 3600000),
        inactivityTimerStartsAt: new Date(),
      });

      const attachRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files`, {
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
      expect(attachRes.status).toBe(200);

      // 4. Peer A (uploader) sees the file
      const peerAFilesRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files`, {
        headers: { "x-device-id": peerA.deviceId },
      });
      const peerAFiles = ((await peerAFilesRes.json()) as any).data.files;
      expect(peerAFiles.some((f: any) => f.fileId === "private-secret-file")).toBe(true);

      // 5. Peer B (designated recipient) sees the file
      const peerBFilesRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files`, {
        headers: { "x-device-id": peerB.deviceId },
      });
      const peerBFiles = ((await peerBFilesRes.json()) as any).data.files;
      expect(peerBFiles.some((f: any) => f.fileId === "private-secret-file")).toBe(true);

      // 6. Peer C (unauthorized) and Host (unauthorized) do NOT see the file in room state or file list
      const peerCFilesRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files`, {
        headers: { "x-device-id": peerC.deviceId },
      });
      const peerCFiles = ((await peerCFilesRes.json()) as any).data.files;
      expect(peerCFiles.some((f: any) => f.fileId === "private-secret-file")).toBe(false);

      const hostFilesRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}`, {
        headers: { "x-device-id": hostData.deviceId },
      });
      const hostFiles = ((await hostFilesRes.json()) as any).data.files;
      expect(hostFiles.some((f: any) => f.fileId === "private-secret-file")).toBe(false);

      // 7. Unauthorized download attempt from Peer C is rejected with 403 Forbidden
      const unauthorizedDownloadRes = await fetch(
        `${baseUrl}/api/rooms/${hostData.roomCode}/files/private-secret-file/download`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": peerC.deviceId,
            "x-device-token": peerC.deviceToken,
          },
        }
      );
      expect(unauthorizedDownloadRes.status).toBe(403);
      const unauthJson = (await unauthorizedDownloadRes.json()) as any;
      expect(unauthJson.error.code).toBe("FORBIDDEN");

      // 8. Authorized download attempt from Peer B succeeds
      const authorizedDownloadRes = await fetch(
        `${baseUrl}/api/rooms/${hostData.roomCode}/files/private-secret-file/download`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": peerB.deviceId,
            "x-device-token": peerB.deviceToken,
          },
        }
      );
      expect(authorizedDownloadRes.status).toBe(200);
      const authJson = (await authorizedDownloadRes.json()) as any;
      expect(authJson.success).toBe(true);
      expect(authJson.data.downloadUrl).toBeDefined();

      // 9. Authorized download attempt from Peer A (uploader) succeeds
      const uploaderDownloadRes = await fetch(
        `${baseUrl}/api/rooms/${hostData.roomCode}/files/private-secret-file/download`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": peerA.deviceId,
            "x-device-token": peerA.deviceToken,
          },
        }
      );
      expect(uploaderDownloadRes.status).toBe(200);
    });

    it("persists recipient permissions across room refresh/reconnection", async () => {
      // 1. Host creates room
      const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: "Host Mac" }),
      });
      const { data: hostData } = (await createRes.json()) as any;

      // 2. Peer A & Peer B join
      const joinResA = await fetch(`${baseUrl}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer A" }),
      });
      const { data: peerA } = (await joinResA.json()) as any;

      const joinResB = await fetch(`${baseUrl}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer B" }),
      });
      const { data: peerB } = (await joinResB.json()) as any;

      // 3. Host uploads file only for Peer A
      const file = await FileModel.create({
        fileId: "persisted-recipient-file",
        originalName: "persisted.txt",
        sanitizedName: "persisted.txt",
        sizeBytes: 100,
        mimeType: "text/plain",
        storageKey: "files/persisted-recipient-file/persisted.txt",
        possessionToken: "token-persist",
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
        body: JSON.stringify({
          fileId: file.fileId,
          possessionToken: file.possessionToken,
          recipientDeviceIds: [peerA.deviceId],
        }),
      });

      // 4. Simulate reload/reconnection by querying GET /api/rooms/:code directly
      const reconnectedPeerARes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}`, {
        headers: { "x-device-id": peerA.deviceId },
      });
      const peerARoom = ((await reconnectedPeerARes.json()) as any).data;
      expect(peerARoom.files.length).toBe(1);
      expect(peerARoom.files[0].fileId).toBe("persisted-recipient-file");
      expect(peerARoom.files[0].recipientDeviceIds).toEqual([peerA.deviceId]);

      const reconnectedPeerBRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}`, {
        headers: { "x-device-id": peerB.deviceId },
      });
      const peerBRoom = ((await reconnectedPeerBRes.json()) as any).data;
      expect(peerBRoom.files.length).toBe(0);
    });
  });

  describe("Voluntary Leave Room & Host Transfer Lifecycle", () => {
    it("allows a regular participant to leave voluntarily and revokes old credentials", async () => {
      // 1. Host creates room
      const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: "Host Mac" }),
      });
      const { data: hostData } = (await createRes.json()) as any;

      // 2. Peer joins & uploads a file
      const joinRes = await fetch(`${baseUrl}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: hostData.roomCode, deviceName: "Leaving Peer" }),
      });
      const { data: peerData } = (await joinRes.json()) as any;

      const file = await FileModel.create({
        fileId: "shared-before-leave",
        originalName: "memo.pdf",
        sanitizedName: "memo.pdf",
        sizeBytes: 1500,
        mimeType: "application/pdf",
        storageKey: "files/shared-before-leave/memo.pdf",
        possessionToken: "token-memo",
        status: "active",
        expiresAt: new Date(Date.now() + 3600000),
        inactivityTimerStartsAt: new Date(),
      });

      await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": peerData.deviceId,
          "x-device-token": peerData.deviceToken,
        },
        body: JSON.stringify({
          fileId: file.fileId,
          possessionToken: file.possessionToken,
        }),
      });

      // 3. Peer leaves voluntarily via POST /api/rooms/:code/leave
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

      // 4. Verify host sees 1 remaining device, but the shared file is still preserved
      const roomCheck = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}`, {
        headers: { "x-device-id": hostData.deviceId },
      });
      const roomData = ((await roomCheck.json()) as any).data;
      expect(roomData.devices.length).toBe(1);
      expect(roomData.devices[0].deviceId).toBe(hostData.deviceId);
      expect(roomData.files.length).toBe(1);
      expect(roomData.files[0].fileId).toBe("shared-before-leave");

      // 5. Verify departed device cannot download file using revoked membership
      const unauthDownloadRes = await fetch(
        `${baseUrl}/api/rooms/${hostData.roomCode}/files/shared-before-leave/download`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": peerData.deviceId,
            "x-device-token": peerData.deviceToken,
          },
        }
      );
      expect(unauthDownloadRes.status).toBe(401);

      // 6. Verify departed device cannot delete file using revoked membership
      const unauthDeleteRes = await fetch(
        `${baseUrl}/api/rooms/${hostData.roomCode}/files/shared-before-leave`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": peerData.deviceId,
            "x-device-token": peerData.deviceToken,
          },
        }
      );
      expect(unauthDeleteRes.status).toBe(401);
    });

    it("transfers host ownership to next participant when host leaves a multi-device room", async () => {
      // 1. Host creates room
      const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: "Original Host" }),
      });
      const { data: hostData } = (await createRes.json()) as any;

      // 2. Peer A (first joiner) and Peer B (second joiner) join
      const joinResA = await fetch(`${baseUrl}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer A (New Host)" }),
      });
      const { data: peerA } = (await joinResA.json()) as any;

      const joinResB = await fetch(`${baseUrl}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: hostData.roomCode, deviceName: "Peer B" }),
      });
      const { data: peerB } = (await joinResB.json()) as any;

      // 3. Host leaves room
      const leaveRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": hostData.deviceId,
          "x-device-token": hostData.deviceToken,
        },
        body: JSON.stringify({ deviceId: hostData.deviceId }),
      });
      expect(leaveRes.status).toBe(200);
      const leaveJson = (await leaveRes.json()) as any;
      expect(leaveJson.data.hostTransferred).toBe(true);
      expect(leaveJson.data.newHostDeviceId).toBe(peerA.deviceId);

      // 4. Verify Peer A is now isHost = true in room state
      const roomCheck = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}`, {
        headers: { "x-device-id": peerA.deviceId },
      });
      const roomData = ((await roomCheck.json()) as any).data;
      expect(roomData.devices.length).toBe(2);

      const newHost = roomData.devices.find((d: any) => d.deviceId === peerA.deviceId);
      expect(newHost.isHost).toBe(true);

      const regularPeer = roomData.devices.find((d: any) => d.deviceId === peerB.deviceId);
      expect(regularPeer.isHost).toBe(false);

      // 5. Verify new host (Peer A) can now perform host actions (e.g. remove Peer B)
      const removePeerRes = await fetch(
        `${baseUrl}/api/rooms/${hostData.roomCode}/devices/${peerB.deviceId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": peerA.deviceId,
            "x-device-token": peerA.deviceToken,
          },
        }
      );
      expect(removePeerRes.status).toBe(200);
    });

    it("closes the room cleanly when the sole participant/host leaves", async () => {
      // 1. Host creates room
      const createRes = await fetch(`${baseUrl}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: "Solo Host" }),
      });
      const { data: hostData } = (await createRes.json()) as any;

      // 2. Sole host leaves
      const leaveRes = await fetch(`${baseUrl}/api/rooms/${hostData.roomCode}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": hostData.deviceId,
          "x-device-token": hostData.deviceToken,
        },
        body: JSON.stringify({ deviceId: hostData.deviceId }),
      });
      expect(leaveRes.status).toBe(200);
      const leaveJson = (await leaveRes.json()) as any;
      expect(leaveJson.data.roomClosed).toBe(true);

      // 3. Room status in DB is closed
      const roomInDb = await RoomModel.findOne({ roomCode: hostData.roomCode });
      expect(roomInDb?.status).toBe("closed");
      expect(roomInDb?.devices.length).toBe(0);
    });
  });
});
