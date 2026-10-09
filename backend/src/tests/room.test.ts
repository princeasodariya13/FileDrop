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
});
