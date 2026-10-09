import { Schema, model, Document } from "mongoose";

export type RoomStatus = "active" | "expired" | "closed";

export interface IRoomDevice {
  deviceId: string;
  deviceToken: string;
  deviceName: string;
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  ipHash?: string;
  joinedAt: Date;
  lastSeenAt: Date;
  isHost: boolean;
}

export interface IRoomFile {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  uploadedByDeviceId: string;
  uploadedByDeviceName: string;
  recipientDeviceIds?: string[];
  createdAt: Date;
}

export interface IRoom extends Document {
  roomId: string;
  roomCode: string;
  hostDeviceId: string;
  creatorIpHash?: string;
  status: RoomStatus;
  devices: IRoomDevice[];
  files: IRoomFile[];
  expiresAt: Date;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RoomDeviceSchema = new Schema<IRoomDevice>(
  {
    deviceId: { type: String, required: true },
    deviceToken: { type: String, required: true },
    deviceName: { type: String, required: true, maxlength: 50 },
    deviceType: {
      type: String,
      enum: ["desktop", "mobile", "tablet", "unknown"],
      default: "unknown",
    },
    ipHash: { type: String },
    joinedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    isHost: { type: Boolean, default: false },
  },
  { _id: false }
);

const RoomFileSchema = new Schema<IRoomFile>(
  {
    fileId: { type: String, required: true },
    fileName: { type: String, required: true, maxlength: 255 },
    sizeBytes: { type: Number, required: true, min: 1 },
    mimeType: { type: String, required: true, maxlength: 255 },
    uploadedByDeviceId: { type: String, required: true },
    uploadedByDeviceName: { type: String, required: true, maxlength: 50 },
    recipientDeviceIds: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RoomSchema = new Schema<IRoom>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    roomCode: { type: String, required: true, unique: true, index: true },
    hostDeviceId: { type: String, required: true },
    creatorIpHash: { type: String, index: true },
    status: {
      type: String,
      enum: ["active", "expired", "closed"],
      default: "active",
      index: true,
    },
    devices: { type: [RoomDeviceSchema], default: [] },
    files: { type: [RoomFileSchema], default: [] },
    expiresAt: { type: Date, required: true, index: true },
    lastActivityAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

RoomSchema.index({ status: 1, expiresAt: 1 });
RoomSchema.index({ "devices.deviceId": 1 });
RoomSchema.index({ "files.fileId": 1 });

export const RoomModel = model<IRoom>("Room", RoomSchema);
