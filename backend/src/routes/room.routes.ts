import { Router } from "express";
import {
  createRoom,
  joinRoom,
  getRoomState,
  getRoomFiles,
  addFileToRoom,
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

// Room State & File Operations
router.get("/:code", roomCodeGuessLimiter, getRoomState);
router.get("/:code/files", roomCodeGuessLimiter, getRoomFiles);
router.post("/:code/files", addFileToRoom);
router.post("/:code/files/:fileId/download", downloadUrlLimiter, downloadRoomFile);
router.get("/:code/files/:fileId/download", downloadUrlLimiter, downloadRoomFile);
router.post("/:code/leave", leaveRoom);


export default router;
