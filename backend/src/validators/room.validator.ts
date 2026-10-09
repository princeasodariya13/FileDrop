import { z } from "zod";

export const createRoomSchema = z.object({
  roomName: z.string().trim().min(1).max(60).optional(),
  deviceName: z.string().trim().min(1).max(50).optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"]).optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const joinRoomSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Must be a valid 6-digit room code"),
  deviceName: z.string().trim().min(1).max(50).optional(),
  deviceType: z.enum(["desktop", "mobile", "tablet", "unknown"]).optional(),
});

export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

export const addRoomFileSchema = z.object({
  fileId: z.string().trim().min(1).max(100),
  possessionToken: z.string().trim().min(1).max(200).optional(),
  recipientDeviceIds: z.array(z.string().trim()).optional(),
});

export type AddRoomFileInput = z.infer<typeof addRoomFileSchema>;

export const updateRoomFileRecipientsSchema = z.object({
  recipientDeviceIds: z.array(z.string().trim()).optional().default([]),
});

export type UpdateRoomFileRecipientsInput = z.infer<typeof updateRoomFileRecipientsSchema>;

export const leaveRoomSchema = z.object({
  deviceId: z.string().trim().min(1).max(100).optional(),
});

export type LeaveRoomInput = z.infer<typeof leaveRoomSchema>;
