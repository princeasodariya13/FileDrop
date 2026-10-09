"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { RoomState, RoomDevice, RoomFile } from "@/types/room";
import { getDeviceDefaults } from "@/utils/device";
import { useToast } from "@/components/ui/Toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const SESSION_KEY = "filedrop_active_room_session";

interface StoredRoomSession {
  roomCode: string;
  deviceId: string;
  deviceToken: string;
  isHost: boolean;
}

export function useConnectRoom(initialCode?: string) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const { push } = useToast();

  const cleanupSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connectSocket = useCallback((code: string, dId: string, dToken: string) => {
    cleanupSocket();

    const socketUrl = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
    const socket = io(socketUrl, {
      auth: {
        roomCode: code,
        deviceId: dId,
        deviceToken: dToken,
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setError(null);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("peer_joined", (newPeer: RoomDevice & { totalDevices?: number }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const exists = prev.devices.some((d) => d.deviceId === newPeer.deviceId);
        const updatedDevices = exists
          ? prev.devices.map((d) => (d.deviceId === newPeer.deviceId ? { ...d, ...newPeer } : d))
          : [...prev.devices, newPeer];
        return {
          ...prev,
          devices: updatedDevices,
        };
      });
      push(`${newPeer.deviceName} joined the room`, "info");
    });

    socket.on("peer_left", ({ deviceId: leftDeviceId, deviceName: leftName }: { deviceId: string; deviceName?: string }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          devices: prev.devices.filter((d) => d.deviceId !== leftDeviceId),
        };
      });
      if (leftName) {
        push(`${leftName} left the room`, "info");
      }
    });

    socket.on("devices_updated", ({ devices }: { devices: RoomDevice[] }) => {
      setRoom((prev) => (prev ? { ...prev, devices } : prev));
      if (dId) {
        const myDev = devices.find((d) => d.deviceId === dId);
        if (myDev) {
          setIsHost((prevHost) => {
            if (!prevHost && myDev.isHost) {
              push("You are now the room host.", "info");
            }
            return myDev.isHost;
          });
        }
      }
    });

    socket.on("file_shared", (newFile: RoomFile) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const alreadyExists = prev.files.some((f) => f.fileId === newFile.fileId);
        if (alreadyExists) return prev;
        return {
          ...prev,
          files: [newFile, ...prev.files],
        };
      });
      push(`New file received: ${newFile.fileName}`, "success");
    });

    socket.on("file_deleted", ({ fileId }: { fileId: string }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          files: prev.files.filter((f) => f.fileId !== fileId),
        };
      });
      push("A file was removed from the room", "info");
    });

    socket.on("device_removed", ({ message }: { message?: string }) => {
      cleanupSocket();
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch (e) {}
      setRoom(null);
      setDeviceId(null);
      setDeviceToken(null);
      setIsHost(false);
      const msg = message || "The host removed your device from this room.";
      setError(msg);
      push(msg, "error");
    });

    socket.on("room_closed", () => {
      setRoom((prev) => (prev ? { ...prev, status: "closed" } : prev));
      push("This room has ended or expired.", "info");
    });

    socket.on("room_error", (err: { message?: string }) => {
      setError(err?.message || "Room connection error.");
    });
  }, [cleanupSocket, push]);

  // Create room
  const createRoom = async (customName?: string) => {
    setIsConnecting(true);
    setError(null);
    try {
      const { deviceName, deviceType } = getDeviceDefaults();
      const res = await fetch(`${API_BASE}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceName: customName?.trim() || deviceName,
          deviceType,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body?.error?.message || "Failed to create room.");
      }

      const data = body.data;
      setRoom({
        roomCode: data.roomCode,
        roomId: data.roomId,
        status: data.status,
        expiresAt: data.expiresAt,
        lastActivityAt: new Date().toISOString(),
        devices: data.devices,
        files: data.files || [],
      });
      setDeviceId(data.deviceId);
      setDeviceToken(data.deviceToken);
      setIsHost(true);

      const session: StoredRoomSession = {
        roomCode: data.roomCode,
        deviceId: data.deviceId,
        deviceToken: data.deviceToken,
        isHost: true,
      };
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch (e) {}

      connectSocket(data.roomCode, data.deviceId, data.deviceToken);
      push(`Room created! Code: ${data.roomCode}`, "success");
      return data.roomCode;
    } catch (err: any) {
      setError(err.message || "Failed to create room.");
      push(err.message || "Failed to create room.", "error");
      throw err;
    } finally {
      setIsConnecting(false);
    }
  };

  // Join room
  const joinRoom = async (code: string, customName?: string) => {
    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Please enter a valid 6-digit room code.");
      push("Please enter a valid 6-digit room code.", "error");
      return;
    }

    setIsConnecting(true);
    setError(null);
    try {
      const { deviceName, deviceType } = getDeviceDefaults();
      const res = await fetch(`${API_BASE}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: cleanCode,
          deviceName: customName?.trim() || deviceName,
          deviceType,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body?.error?.message || "Room not found or has expired.");
      }

      const data = body.data;
      setRoom({
        roomCode: data.roomCode,
        roomId: data.roomId,
        status: data.status,
        expiresAt: data.expiresAt,
        lastActivityAt: new Date().toISOString(),
        devices: data.devices,
        files: data.files || [],
      });
      setDeviceId(data.deviceId);
      setDeviceToken(data.deviceToken);
      setIsHost(data.isHost || false);

      const session: StoredRoomSession = {
        roomCode: data.roomCode,
        deviceId: data.deviceId,
        deviceToken: data.deviceToken,
        isHost: data.isHost || false,
      };
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch (e) {}

      connectSocket(data.roomCode, data.deviceId, data.deviceToken);
      push(`Connected to Room ${data.roomCode}`, "success");
      return data.roomCode;
    } catch (err: any) {
      setError(err.message || "Failed to join room.");
      push(err.message || "Failed to join room.", "error");
      throw err;
    } finally {
      setIsConnecting(false);
    }
  };

  // Upload a single file directly into the active room with optional private recipient filtering
  const uploadFileToRoom = async (file: File, recipientDeviceIds?: string[]) => {
    if (!room || !deviceId || !deviceToken) {
      push("You must be connected to a room to upload files.", "error");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadingFileName(file.name);

    try {
      // Import existing API helpers
      const { createUploadSession, completeUpload } = await import("@/lib/api/uploads");
      const { uploadPartWithProgress } = await import("@/lib/api/client");

      // 1. Initialize upload session using existing FileDrop upload API (/api/uploads/session)
      const session = await createUploadSession(file, {
        expirationSeconds: 3600, // 1 hour room file TTL
        downloadLimit: null,
      });

      const partSize = session.partSizeBytes;
      const completedParts = [];

      // 2. Upload parts directly to Backblaze B2 via presigned URLs with progress
      for (let i = 0; i < session.parts.length; i++) {
        const part = session.parts[i];
        const start = (part.partNumber - 1) * partSize;
        const end = Math.min(start + partSize, file.size);
        const chunk = file.slice(start, end);

        const etag = await uploadPartWithProgress(
          part.presignedUrl,
          chunk,
          (loaded) => {
            const overallLoaded = i * partSize + loaded;
            const pct = Math.min(95, Math.round((overallLoaded / file.size) * 100));
            setUploadProgress(pct);
          }
        );

        completedParts.push({
          partNumber: part.partNumber,
          etag,
        });
      }

      // 3. Complete multipart upload on backend
      const uploadedFile = await completeUpload(session.sessionId, completedParts);
      setUploadProgress(98);

      // 4. Attach file to room with optional recipient filtering
      const attachRes = await fetch(`${API_BASE}/api/rooms/${room.roomCode}/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
          "x-device-token": deviceToken,
        },
        body: JSON.stringify({
          fileId: uploadedFile.fileId,
          possessionToken: uploadedFile.possessionToken,
          recipientDeviceIds:
            recipientDeviceIds && recipientDeviceIds.length > 0 ? recipientDeviceIds : undefined,
        }),
      });

      const attachBody = await attachRes.json();
      if (attachRes.ok && attachBody.success) {
        setRoom((prev) => (prev ? { ...prev, files: attachBody.data.files } : prev));
      }

      setUploadProgress(100);
      push(`Shared ${file.name} to room`, "success");
    } catch (err: any) {
      console.error("Room upload error:", err);
      push(err.message || "Failed to upload file to room.", "error");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadingFileName(null);
    }
  };

  // Upload multiple files sequentially to prevent concurrent collisions
  const uploadFilesToRoom = async (files: File[]) => {
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await uploadFileToRoom(files[i]);
    }
  };


  // Download a shared room file
  const downloadFile = async (fileId: string, fileName: string) => {
    if (!room) return;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (deviceId) headers["x-device-id"] = deviceId;
      if (deviceToken) headers["x-device-token"] = deviceToken;

      const res = await fetch(`${API_BASE}/api/rooms/${room.roomCode}/files/${fileId}/download`, {
        method: "POST",
        headers,
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body?.error?.message || "Download failed. File may have expired.");
      }

      const { downloadUrl } = body.data;

      // Trigger instant browser download
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      push(`Starting download: ${fileName}`, "info");
    } catch (err: any) {
      push(err.message || "Could not download file.", "error");
    }
  };

  // Delete a shared room file (only permitted if uploaded by this device)
  const deleteFileFromRoom = async (fileId: string) => {
    if (!room || !deviceId || !deviceToken) {
      push("You must be connected to delete files.", "error");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/rooms/${room.roomCode}/files/${fileId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
          "x-device-token": deviceToken,
        },
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body?.error?.message || "Failed to delete file.");
      }

      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          files: prev.files.filter((f) => f.fileId !== fileId),
        };
      });
      push("File removed from room", "success");
    } catch (err: any) {
      push(err.message || "Could not delete file.", "error");
      throw err;
    }
  };

  // Remove a device from the room (Host only)
  const removeDeviceFromRoom = async (targetDeviceId: string) => {
    if (!room || !deviceId || !deviceToken) {
      push("Host credentials required to remove device.", "error");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/rooms/${room.roomCode}/devices/${targetDeviceId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
          "x-device-token": deviceToken,
        },
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body?.error?.message || "Failed to remove device.");
      }

      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          devices: prev.devices.filter((d) => d.deviceId !== targetDeviceId),
        };
      });
      push("Device removed from room", "success");
    } catch (err: any) {
      push(err.message || "Could not remove device.", "error");
      throw err;
    }
  };

  // Leave room
  const leaveRoom = async () => {
    if (room && deviceId) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        };
        if (deviceToken) {
          headers["x-device-token"] = deviceToken;
        }

        const res = await fetch(`${API_BASE}/api/rooms/${room.roomCode}/leave`, {
          method: "POST",
          headers,
          body: JSON.stringify({ deviceId }),
        });

        const body = await res.json();
        if (!res.ok || !body.success) {
          console.warn("Leave room server warning:", body?.error?.message);
        }
      } catch (e) {
        console.warn("Network error while notifying server of departure:", e);
      }
    }

    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}

    cleanupSocket();
    setRoom(null);
    setDeviceId(null);
    setDeviceToken(null);
    setIsHost(false);
    setError(null);
    push("Left the room", "info");
  };

  // Auto-restore session from sessionStorage or initialCode
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedStr = sessionStorage.getItem(SESSION_KEY);
        if (storedStr) {
          const stored: StoredRoomSession = JSON.parse(storedStr);
          if (stored.roomCode && stored.deviceId && stored.deviceToken) {
            // Fetch current state
            const res = await fetch(`${API_BASE}/api/rooms/${stored.roomCode}`, {
              headers: { "x-device-id": stored.deviceId },
            });
            const body = await res.json();
            if (res.ok && body.success) {
              setRoom({
                roomCode: body.data.roomCode,
                roomId: body.data.roomId,
                status: body.data.status,
                expiresAt: body.data.expiresAt,
                lastActivityAt: body.data.lastActivityAt,
                devices: body.data.devices,
                files: body.data.files || [],
              });
              setDeviceId(stored.deviceId);
              setDeviceToken(stored.deviceToken);
              setIsHost(stored.isHost);
              connectSocket(stored.roomCode, stored.deviceId, stored.deviceToken);
              return;
            }
          }
        }
      } catch (e) {}

      // If initial code provided (e.g. from URL /room/123456)
      if (initialCode && /^\d{6}$/.test(initialCode.trim())) {
        joinRoom(initialCode.trim());
      }
    };

    restoreSession();

    return () => {
      cleanupSocket();
    };
  }, [initialCode]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    room,
    deviceId,
    deviceToken,
    isHost,
    isConnected,
    isConnecting,
    isUploading,
    uploadProgress,
    uploadingFileName,
    error,
    createRoom,
    joinRoom,
    uploadFileToRoom,
    uploadFilesToRoom,
    downloadFile,
    deleteFileFromRoom,
    removeDeviceFromRoom,
    leaveRoom,
  };
}
