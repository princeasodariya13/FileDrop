import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { RoomState, RoomDevice, RoomFile, RoomSummary } from "@/types/room";
import { getDeviceDefaults, getSmartDeviceName } from "@/utils/device";
import { useToast } from "@/components/ui/Toast";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const SESSIONS_MAP_KEY = "filedrop_active_room_sessions";
const CURRENT_ROOM_KEY = "filedrop_current_room_code";
const LEGACY_SESSION_KEY = "filedrop_active_room_session";
const LEFT_ROOMS_KEY = "filedrop_left_room_codes";

export interface StoredRoomSession {
  roomCode: string;
  roomId?: string;
  roomName?: string;
  deviceId: string;
  deviceToken: string;
  isHost: boolean;
  joinedAt?: string;
  lastActiveAt?: string;
}

export type StoredSessionsMap = Record<string, StoredRoomSession>;

export function getLeftRoomCodes(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LEFT_ROOMS_KEY) || sessionStorage.getItem(LEFT_ROOMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {}
  return new Set();
}

export function addLeftRoomCode(code: string) {
  if (typeof window === "undefined" || !code) return;
  try {
    const set = getLeftRoomCodes();
    set.add(code.trim());
    const arr = Array.from(set);
    localStorage.setItem(LEFT_ROOMS_KEY, JSON.stringify(arr));
    try {
      sessionStorage.setItem(LEFT_ROOMS_KEY, JSON.stringify(arr));
    } catch {}
  } catch {}
}

export function removeLeftRoomCode(code: string) {
  if (typeof window === "undefined" || !code) return;
  try {
    const set = getLeftRoomCodes();
    if (set.has(code.trim())) {
      set.delete(code.trim());
      const arr = Array.from(set);
      localStorage.setItem(LEFT_ROOMS_KEY, JSON.stringify(arr));
      try {
        sessionStorage.setItem(LEFT_ROOMS_KEY, JSON.stringify(arr));
      } catch {}
    }
  } catch {}
}

function getStoredSessionsMap(): StoredSessionsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SESSIONS_MAP_KEY) || sessionStorage.getItem(SESSIONS_MAP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (e) {}

  // Check legacy single-room session
  try {
    const legacyRaw = localStorage.getItem(LEGACY_SESSION_KEY) || sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      if (legacy && legacy.roomCode && legacy.deviceId && legacy.deviceToken) {
        const map: StoredSessionsMap = { [legacy.roomCode]: legacy };
        localStorage.setItem(SESSIONS_MAP_KEY, JSON.stringify(map));
        return map;
      }
    }
  } catch (e) {}

  return {};
}

function saveStoredSession(session: StoredRoomSession, makeActive: boolean = true) {
  if (typeof window === "undefined") return;
  try {
    const map = getStoredSessionsMap();
    map[session.roomCode] = {
      ...session,
      lastActiveAt: new Date().toISOString(),
    };
    localStorage.setItem(SESSIONS_MAP_KEY, JSON.stringify(map));

    if (makeActive) {
      localStorage.setItem(CURRENT_ROOM_KEY, session.roomCode);
      localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(session));
    }

    window.dispatchEvent(
      new CustomEvent("filedrop_room_session_changed", {
        detail: { activeSession: session, allSessions: map },
      })
    );
  } catch (e) {
    try {
      sessionStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(session));
    } catch {}
  }
}

function removeStoredSession(roomCode: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const map = getStoredSessionsMap();
    delete map[roomCode];
    localStorage.setItem(SESSIONS_MAP_KEY, JSON.stringify(map));

    const remainingCodes = Object.keys(map);
    const nextActiveCode = remainingCodes.length > 0 ? remainingCodes[0] : null;

    if (nextActiveCode) {
      localStorage.setItem(CURRENT_ROOM_KEY, nextActiveCode);
      localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(map[nextActiveCode]));
    } else {
      localStorage.removeItem(CURRENT_ROOM_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    }

    window.dispatchEvent(
      new CustomEvent("filedrop_room_session_changed", {
        detail: {
          activeSession: nextActiveCode ? map[nextActiveCode] : null,
          allSessions: map,
        },
      })
    );

    return nextActiveCode;
  } catch (e) {
    return null;
  }
}

function getActiveStoredSession(): StoredRoomSession | null {
  if (typeof window === "undefined") return null;
  try {
    const map = getStoredSessionsMap();
    const currentCode = localStorage.getItem(CURRENT_ROOM_KEY) || sessionStorage.getItem(CURRENT_ROOM_KEY);
    if (currentCode && map[currentCode]) {
      return map[currentCode];
    }
    const keys = Object.keys(map);
    if (keys.length > 0) {
      return map[keys[0]];
    }
  } catch (e) {}
  return null;
}

export function useConnectRoom(initialCode?: string) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [activeRooms, setActiveRooms] = useState<RoomSummary[]>([]);
  const [currentRoomCode, setCurrentRoomCode] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
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

  const refreshActiveRoomsList = useCallback(async () => {
    const localMap = getStoredSessionsMap();
    const leftCodes = getLeftRoomCodes();

    // Clean up any left room codes from localMap
    for (const leftCode of leftCodes) {
      if (localMap[leftCode]) {
        delete localMap[leftCode];
      }
    }

    const localCodes = Object.keys(localMap).filter((c) => !leftCodes.has(c));

    // 1. Query server for all active rooms associated with this client/IP
    let serverRooms: any[] = [];
    try {
      const lookupRes = await fetch(`${API_BASE}/api/rooms/active/lookup`);
      const lookupBody = await lookupRes.json();
      if (lookupRes.ok && lookupBody.success && Array.isArray(lookupBody.data?.activeRooms)) {
        serverRooms = lookupBody.data.activeRooms.filter(
          (sr: any) => sr && sr.roomCode && !leftCodes.has(sr.roomCode)
        );
      }
    } catch (err) {
      // Network blip; fall back to locally saved sessions
    }

    // 2. Fetch individual room states for any local session not covered or to refresh details
    const summariesMap: Record<string, RoomSummary> = {};

    // Populate from server lookup
    for (const sr of serverRooms) {
      if (sr && sr.roomCode && !leftCodes.has(sr.roomCode)) {
        const localSession = localMap[sr.roomCode];
        summariesMap[sr.roomCode] = {
          roomCode: sr.roomCode,
          roomId: sr.roomId || localSession?.roomId || "",
          roomName: sr.roomName || localSession?.roomName || "Live Room",
          isHost: localSession?.isHost ?? sr.isHost ?? false,
          deviceId: localSession?.deviceId || sr.deviceId,
          participantCount: sr.participantCount ?? sr.devicesCount ?? sr.devices?.length ?? 1,
          filesCount: sr.filesCount ?? sr.files?.length ?? 0,
          status: sr.status || "active",
          expiresAt: sr.expiresAt,
          lastActivityAt: sr.lastActivityAt,
        };

        // If this room has a local session, ensure its roomName / roomId are updated in local storage
        if (localSession) {
          localMap[sr.roomCode] = {
            ...localSession,
            roomId: sr.roomId || localSession.roomId,
            roomName: sr.roomName || localSession.roomName,
            isHost: localSession.isHost ?? sr.isHost ?? false,
          };
        }
      }
    }

    // Populate / verify remaining local sessions
    for (const code of localCodes) {
      if (summariesMap[code] || leftCodes.has(code)) continue;

      const session = localMap[code];
      try {
        const res = await fetch(`${API_BASE}/api/rooms/${code}`, {
          headers: {
            "x-device-id": session.deviceId,
            "x-device-token": session.deviceToken,
          },
        });
        const body = await res.json();
        if (res.ok && body.success && body.data) {
          const rData = body.data;
          summariesMap[code] = {
            roomCode: code,
            roomId: rData.roomId || session.roomId || "",
            roomName: rData.roomName || session.roomName || "Live Room",
            isHost: session.isHost,
            deviceId: session.deviceId,
            participantCount: rData.devices?.length || 1,
            filesCount: rData.files?.length || 0,
            status: rData.status || "active",
            expiresAt: rData.expiresAt,
            lastActivityAt: rData.lastActivityAt,
          };
        } else if (res.status === 404 || body?.error?.code === "ROOM_NOT_FOUND") {
          // Room expired or closed on server — prune from local storage
          delete localMap[code];
        } else {
          // Temporary server error, keep session stub
          summariesMap[code] = {
            roomCode: code,
            roomId: session.roomId || "",
            roomName: session.roomName || "Live Room",
            isHost: session.isHost,
            deviceId: session.deviceId,
            participantCount: 1,
            filesCount: 0,
            status: "active",
          };
        }
      } catch {
        // Network error, keep existing local session stub
        summariesMap[code] = {
          roomCode: code,
          roomId: session.roomId || "",
          roomName: session.roomName || "Live Room",
          isHost: session.isHost,
          deviceId: session.deviceId,
          participantCount: 1,
          filesCount: 0,
          status: "active",
        };
      }
    }

    // Save pruned / updated map to localStorage
    try {
      localStorage.setItem(SESSIONS_MAP_KEY, JSON.stringify(localMap));
    } catch {}

    const allSummaries = Object.values(summariesMap);
    setActiveRooms(allSummaries);
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

    socket.on("peer_left", ({ deviceId: leftDeviceId, deviceName: leftName, reason }: { deviceId: string; deviceName?: string; reason?: string }) => {
      // Only remove device from active room membership if departure was voluntary or removal by host
      if (reason === "voluntary_leave" || reason === "removed_by_host") {
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

    socket.on("file_recipients_updated", (updatedFile: RoomFile) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const canSee =
          !updatedFile.recipientDeviceIds ||
          updatedFile.recipientDeviceIds.length === 0 ||
          updatedFile.uploadedByDeviceId === dId ||
          updatedFile.recipientDeviceIds.includes(dId);

        const exists = prev.files.some((f) => f.fileId === updatedFile.fileId);

        if (canSee) {
          if (exists) {
            return {
              ...prev,
              files: prev.files.map((f) => (f.fileId === updatedFile.fileId ? updatedFile : f)),
            };
          } else {
            return {
              ...prev,
              files: [updatedFile, ...prev.files],
            };
          }
        } else {
          return {
            ...prev,
            files: prev.files.filter((f) => f.fileId !== updatedFile.fileId),
          };
        }
      });
      if (
        dId &&
        updatedFile.recipientDeviceIds &&
        updatedFile.recipientDeviceIds.length > 0 &&
        updatedFile.recipientDeviceIds.includes(dId) &&
        updatedFile.uploadedByDeviceId !== dId
      ) {
        push(`File shared with you: ${updatedFile.fileName}`, "info");
      }
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
      const nextCode = removeStoredSession(code);
      if (nextCode) {
        switchRoom(nextCode);
      } else {
        setRoom(null);
        setDeviceId(null);
        setDeviceToken(null);
        setIsHost(false);
        setCurrentRoomCode(null);
      }
      refreshActiveRoomsList();
      const msg = message || "The host removed your device from this room.";
      setError(msg);
      push(msg, "error");
    });

    socket.on("room_closed", () => {
      cleanupSocket();
      const nextCode = removeStoredSession(code);
      if (nextCode) {
        switchRoom(nextCode);
      } else {
        setRoom((prev) => (prev ? { ...prev, status: "closed" } : prev));
        setCurrentRoomCode(null);
      }
      refreshActiveRoomsList();
      push(`Room ${code} has ended or expired.`, "info");
    });

    socket.on("room_error", (err: { message?: string }) => {
      setError(err?.message || "Room connection error.");
    });
  }, [cleanupSocket, push, refreshActiveRoomsList]);

  // Switch active room
  const switchRoom = async (targetCode: string) => {
    const cleanCode = targetCode.trim();
    const map = getStoredSessionsMap();
    const session = map[cleanCode];

    if (!session) {
      // If credentials for this room don't exist in this browser, auto-join it
      try {
        await joinRoom(cleanCode);
        return;
      } catch (err: any) {
        push("Could not connect to room " + cleanCode, "error");
        return;
      }
    }

    setIsConnecting(true);
    setError(null);
    cleanupSocket();

    try {
      const res = await fetch(`${API_BASE}/api/rooms/${cleanCode}`, {
        headers: {
          "x-device-id": session.deviceId,
          "x-device-token": session.deviceToken,
        },
      });

      const body = await res.json();
      if (!res.ok || !body.success || !body.data) {
        removeStoredSession(cleanCode);
        throw new Error(body?.error?.message || "Room has expired or is no longer available.");
      }

      const data = body.data;
      const currentDev = data.devices?.find((d: RoomDevice) => d.deviceId === session.deviceId);

      setRoom({
        roomCode: data.roomCode,
        roomId: data.roomId,
        roomName: data.roomName || session.roomName || "Live Room",
        status: data.status,
        expiresAt: data.expiresAt,
        lastActivityAt: data.lastActivityAt,
        devices: data.devices,
        files: data.files || [],
      });
      setDeviceId(session.deviceId);
      setDeviceToken(session.deviceToken);
      setIsHost(currentDev ? currentDev.isHost : session.isHost);
      setCurrentRoomCode(data.roomCode);

      saveStoredSession(
        {
          roomCode: data.roomCode,
          roomId: data.roomId,
          roomName: data.roomName || session.roomName || "Live Room",
          deviceId: session.deviceId,
          deviceToken: session.deviceToken,
          isHost: currentDev ? currentDev.isHost : session.isHost,
        },
        true
      );

      connectSocket(data.roomCode, session.deviceId, session.deviceToken);
      refreshActiveRoomsList();
      push(`Switched to: ${data.roomName || `Room #${data.roomCode}`}`, "info");
    } catch (err: any) {
      setError(err.message || "Failed to switch room.");
      push(err.message || "Failed to switch room.", "error");
    } finally {
      setIsConnecting(false);
    }
  };

  // Create room
  const createRoom = async (customName?: string, customRoomName?: string) => {
    setIsConnecting(true);
    setError(null);
    try {
      const { deviceName, deviceType } = getDeviceDefaults();
      const res = await fetch(`${API_BASE}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: customRoomName?.trim() || "Live Room",
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
        roomName: data.roomName || customRoomName || "Live Room",
        status: data.status,
        expiresAt: data.expiresAt,
        lastActivityAt: new Date().toISOString(),
        devices: data.devices,
        files: data.files || [],
      });
      setDeviceId(data.deviceId);
      setDeviceToken(data.deviceToken);
      setIsHost(true);
      setCurrentRoomCode(data.roomCode);

      saveStoredSession(
        {
          roomCode: data.roomCode,
          roomId: data.roomId,
          roomName: data.roomName || customRoomName || "Live Room",
          deviceId: data.deviceId,
          deviceToken: data.deviceToken,
          isHost: true,
        },
        true
      );

      // Optimistically update activeRooms so it shows immediately
      const newSummary: RoomSummary = {
        roomCode: data.roomCode,
        roomId: data.roomId,
        roomName: data.roomName || customRoomName || "Live Room",
        isHost: true,
        deviceId: data.deviceId,
        participantCount: data.devices?.length || 1,
        filesCount: data.files?.length || 0,
        status: data.status || "active",
        expiresAt: data.expiresAt,
        lastActivityAt: new Date().toISOString(),
      };
      setActiveRooms((prev) => {
        const filtered = prev.filter((r) => r.roomCode !== data.roomCode);
        return [newSummary, ...filtered];
      });

      removeLeftRoomCode(data.roomCode);

      connectSocket(data.roomCode, data.deviceId, data.deviceToken);
      refreshActiveRoomsList();
      push(`Room created! Code: ${data.roomCode} (${data.roomName || "Live Room"})`, "success");
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
        roomName: data.roomName || "Live Room",
        status: data.status,
        expiresAt: data.expiresAt,
        lastActivityAt: new Date().toISOString(),
        devices: data.devices,
        files: data.files || [],
      });
      setDeviceId(data.deviceId);
      setDeviceToken(data.deviceToken);
      setIsHost(data.isHost || false);
      setCurrentRoomCode(data.roomCode);

      saveStoredSession(
        {
          roomCode: data.roomCode,
          roomId: data.roomId,
          roomName: data.roomName || "Live Room",
          deviceId: data.deviceId,
          deviceToken: data.deviceToken,
          isHost: data.isHost || false,
        },
        true
      );

      // Optimistically update activeRooms so it shows immediately
      const newSummary: RoomSummary = {
        roomCode: data.roomCode,
        roomId: data.roomId,
        roomName: data.roomName || "Live Room",
        isHost: data.isHost || false,
        deviceId: data.deviceId,
        participantCount: data.devices?.length || 1,
        filesCount: data.files?.length || 0,
        status: data.status || "active",
        expiresAt: data.expiresAt,
        lastActivityAt: new Date().toISOString(),
      };
      setActiveRooms((prev) => {
        const filtered = prev.filter((r) => r.roomCode !== data.roomCode);
        return [newSummary, ...filtered];
      });

      removeLeftRoomCode(cleanCode);

      connectSocket(data.roomCode, data.deviceId, data.deviceToken);
      refreshActiveRoomsList();
      push(`Connected to Room ${data.roomCode} (${data.roomName || "Live Room"})`, "success");
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

  // Update authorized recipient devices for an uploaded room file
  const updateFileRecipients = async (fileId: string, recipientDeviceIds: string[]) => {
    if (!room || !deviceId || !deviceToken) {
      push("Credentials required to update file recipients.", "error");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/rooms/${room.roomCode}/files/${fileId}/recipients`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
          "x-device-token": deviceToken,
        },
        body: JSON.stringify({ recipientDeviceIds }),
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body?.error?.message || "Failed to update recipients.");
      }

      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          files: prev.files.map((f) =>
            f.fileId === fileId ? { ...f, recipientDeviceIds } : f
          ),
        };
      });

      push("Recipients updated successfully", "success");
    } catch (err: any) {
      push(err.message || "Could not update file recipients.", "error");
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

  // Leave room voluntarily
  const leaveRoom = async (targetRoomCode?: string) => {
    const codeToLeave = targetRoomCode || currentRoomCode || room?.roomCode;
    if (!codeToLeave) return;

    // 1. Mark as intentionally left so auto-reconnection will never restore it
    addLeftRoomCode(codeToLeave);

    const map = getStoredSessionsMap();
    const session = map[codeToLeave];

    // 2. Notify backend server to remove device / close room
    if (session) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "x-device-id": session.deviceId,
        };
        if (session.deviceToken) {
          headers["x-device-token"] = session.deviceToken;
        }

        await fetch(`${API_BASE}/api/rooms/${codeToLeave}/leave`, {
          method: "POST",
          headers,
          body: JSON.stringify({ deviceId: session.deviceId }),
        });
      } catch (e) {
        console.warn("Network error while notifying server of departure:", e);
      }
    }

    // 3. Remove from local browser storage
    const nextActiveCode = removeStoredSession(codeToLeave);

    // 4. Optimistically remove from activeRooms list
    setActiveRooms((prev) => prev.filter((r) => r.roomCode !== codeToLeave));

    // 5. If this was the active room in current view, disconnect and switch or clear
    if (codeToLeave === currentRoomCode || codeToLeave === room?.roomCode) {
      cleanupSocket();
      if (nextActiveCode) {
        await switchRoom(nextActiveCode);
      } else {
        setRoom(null);
        setDeviceId(null);
        setDeviceToken(null);
        setIsHost(false);
        setCurrentRoomCode(null);
      }
    }

    refreshActiveRoomsList();
    push(`Left Room ${codeToLeave}`, "info");
  };

  // Auto-restore sessions from localStorage or discover active rooms on this machine
  useEffect(() => {
    let isCancelled = false;

    const restoreSessions = async () => {
      try {
        const leftCodes = getLeftRoomCodes();

        // If initialCode specified (e.g. on /room/[code] direct page)
        if (initialCode && !leftCodes.has(initialCode)) {
          const map = getStoredSessionsMap();
          const session = map[initialCode];
          if (session && session.deviceId && session.deviceToken) {
            const res = await fetch(`${API_BASE}/api/rooms/${initialCode}`, {
              headers: {
                "x-device-id": session.deviceId,
                "x-device-token": session.deviceToken,
              },
            });
            const body = await res.json();
            if (!isCancelled && res.ok && body.success && body.data) {
              const currentDev = body.data.devices?.find(
                (d: RoomDevice) => d.deviceId === session.deviceId
              );
              if (currentDev) {
                setRoom({
                  roomCode: body.data.roomCode,
                  roomId: body.data.roomId,
                  roomName: body.data.roomName || session.roomName || "Live Room",
                  status: body.data.status,
                  expiresAt: body.data.expiresAt,
                  lastActivityAt: body.data.lastActivityAt,
                  devices: body.data.devices,
                  files: body.data.files || [],
                });
                setDeviceId(session.deviceId);
                setDeviceToken(session.deviceToken);
                setIsHost(currentDev.isHost);
                setCurrentRoomCode(session.roomCode);
                connectSocket(session.roomCode, session.deviceId, session.deviceToken);
                refreshActiveRoomsList();
                return;
              }
            }
          }
        }

        // Check stored session map
        const activeStored = getActiveStoredSession();
        if (
          activeStored &&
          activeStored.roomCode &&
          activeStored.deviceId &&
          activeStored.deviceToken &&
          !leftCodes.has(activeStored.roomCode)
        ) {
          const res = await fetch(`${API_BASE}/api/rooms/${activeStored.roomCode}`, {
            headers: {
              "x-device-id": activeStored.deviceId,
              "x-device-token": activeStored.deviceToken,
            },
          });
          const body = await res.json();
          if (!isCancelled && res.ok && body.success && body.data) {
            const currentDev = body.data.devices?.find(
              (d: RoomDevice) => d.deviceId === activeStored.deviceId
            );
            if (currentDev) {
              setRoom({
                roomCode: body.data.roomCode,
                roomId: body.data.roomId,
                roomName: body.data.roomName || activeStored.roomName || "Live Room",
                status: body.data.status,
                expiresAt: body.data.expiresAt,
                lastActivityAt: body.data.lastActivityAt,
                devices: body.data.devices,
                files: body.data.files || [],
              });
              setDeviceId(activeStored.deviceId);
              setDeviceToken(activeStored.deviceToken);
              setIsHost(currentDev.isHost);
              setCurrentRoomCode(activeStored.roomCode);
              connectSocket(activeStored.roomCode, activeStored.deviceId, activeStored.deviceToken);
              refreshActiveRoomsList();
              return;
            }
          }
          // Active stored session was invalid/expired
          removeStoredSession(activeStored.roomCode);
        }

        // If no active stored session in this browser, check if an active room exists on this machine across browsers
        if (!initialCode) {
          const lookupRes = await fetch(`${API_BASE}/api/rooms/active/lookup`);
          const lookupBody = await lookupRes.json();
          if (
            !isCancelled &&
            lookupRes.ok &&
            lookupBody.success &&
            lookupBody.data?.activeRoom &&
            !leftCodes.has(lookupBody.data.activeRoom.roomCode)
          ) {
            const activeRoomData = lookupBody.data.activeRoom;
            const existingNames = (activeRoomData.devices || []).map((d: any) => d.deviceName);
            const { deviceName, deviceType } = getSmartDeviceName(existingNames);

            const joinRes = await fetch(`${API_BASE}/api/rooms/join`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: activeRoomData.roomCode,
                deviceName,
                deviceType,
              }),
            });

            const joinBody = await joinRes.json();
            if (!isCancelled && joinRes.ok && joinBody.success && joinBody.data) {
              const joined = joinBody.data;
              setRoom({
                roomCode: joined.roomCode,
                roomId: joined.roomId,
                roomName: joined.roomName || "Live Room",
                status: joined.status,
                expiresAt: joined.expiresAt,
                lastActivityAt: new Date().toISOString(),
                devices: joined.devices,
                files: joined.files || [],
              });
              setDeviceId(joined.deviceId);
              setDeviceToken(joined.deviceToken);
              setIsHost(joined.isHost || false);
              setCurrentRoomCode(joined.roomCode);

              saveStoredSession(
                {
                  roomCode: joined.roomCode,
                  roomId: joined.roomId,
                  roomName: joined.roomName || "Live Room",
                  deviceId: joined.deviceId,
                  deviceToken: joined.deviceToken,
                  isHost: joined.isHost || false,
                },
                true
              );

              connectSocket(joined.roomCode, joined.deviceId, joined.deviceToken);
              refreshActiveRoomsList();
              push(`Connected to Room ${joined.roomCode} (${deviceName})`, "success");
            }
          }
        }
      } catch (e) {
        // Keep storage on network error so user isn't kicked out during blips
      } finally {
        if (!isCancelled) {
          setIsInitializing(false);
        }
      }
    };

    restoreSessions();

    return () => {
      isCancelled = true;
      cleanupSocket();
    };
  }, [initialCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Multi-tab and same-tab sync: listen for storage and session changed events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SESSIONS_MAP_KEY || e.key === CURRENT_ROOM_KEY) {
        refreshActiveRoomsList();
        const active = getActiveStoredSession();
        if (!active) {
          cleanupSocket();
          setRoom(null);
          setDeviceId(null);
          setDeviceToken(null);
          setIsHost(false);
          setCurrentRoomCode(null);
        }
      }
    };

    const handleCustomChange = () => {
      refreshActiveRoomsList();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("filedrop_room_session_changed", handleCustomChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("filedrop_room_session_changed", handleCustomChange);
    };
  }, [cleanupSocket, refreshActiveRoomsList]);

  return {
    room,
    activeRooms,
    currentRoomCode,
    deviceId,
    deviceToken,
    isHost,
    isConnected,
    isConnecting,
    isInitializing,
    isUploading,
    uploadProgress,
    uploadingFileName,
    error,
    switchRoom,
    createRoom,
    joinRoom,
    uploadFileToRoom,
    uploadFilesToRoom,
    downloadFile,
    updateFileRecipients,
    deleteFileFromRoom,
    removeDeviceFromRoom,
    leaveRoom,
    refreshActiveRoomsList,
  };
}
