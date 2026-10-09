import { Router } from "express";
import {
  createRoom,
  joinRoom,
  getActiveRoomForClient,
  getRoomState,
  getRoomFiles,
  addFileToRoom,
  updateRoomFileRecipients,
  deleteRoomFile,
  removeRoomDevice,
  downloadRoomFile,
  leaveRoom,
} from "@/controllers/room.controller";
import {
  roomCreateLimiter,
  roomCodeGuessLimiter,
  downloadUrlLimiter,
} from "@/middleware/rateLimit";

const router = Router();

// Room Creation & Joining
router.post("/", roomCreateLimiter, createRoom);
router.post("/create", roomCreateLimiter, createRoom);
router.post("/join", roomCodeGuessLimiter, joinRoom);

// Cross-browser active room auto-lookup
router.get("/active/lookup", getActiveRoomForClient);
router.get("/active-client", getActiveRoomForClient);

// Room State & File Operations
router.get("/:code", roomCodeGuessLimiter, getRoomState);
router.get("/:code/files", roomCodeGuessLimiter, getRoomFiles);
router.post("/:code/files", addFileToRoom);
router.patch("/:code/files/:fileId/recipients", updateRoomFileRecipients);
router.delete("/:code/files/:fileId", deleteRoomFile);
router.delete("/:code/devices/:deviceId", removeRoomDevice);
router.post("/:code/files/:fileId/download", downloadUrlLimiter, downloadRoomFile);
router.get("/:code/files/:fileId/download", downloadUrlLimiter, downloadRoomFile);
router.post("/:code/leave", leaveRoom);

export default router;
