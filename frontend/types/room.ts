export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export interface RoomDevice {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  joinedAt: string;
  lastSeenAt: string;
  isHost: boolean;
}

export interface RoomFile {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  uploadedByDeviceId: string;
  uploadedByDeviceName: string;
  recipientDeviceIds?: string[];
  createdAt: string;
}

export interface RoomState {
  roomCode: string;
  roomId: string;
  roomName?: string;
  status: "active" | "expired" | "closed";
  expiresAt: string;
  lastActivityAt: string;
  devices: RoomDevice[];
  files: RoomFile[];
}

export interface RoomSummary {
  roomCode: string;
  roomId: string;
  roomName: string;
  isHost: boolean;
  deviceId: string;
  participantCount?: number;
  filesCount?: number;
  status: "active" | "expired" | "closed";
  expiresAt?: string;
  lastActivityAt?: string;
}

export interface CreateRoomResponse {
  roomCode: string;
  roomId: string;
  roomName?: string;
  deviceId: string;
  deviceToken: string;
  expiresAt: string;
  status: string;
  devices: RoomDevice[];
  files: RoomFile[];
}

export interface JoinRoomResponse {
  roomCode: string;
  roomId: string;
  roomName?: string;
  deviceId: string;
  deviceToken: string;
  isHost: boolean;
  expiresAt: string;
  status: string;
  devices: RoomDevice[];
  files: RoomFile[];
}
