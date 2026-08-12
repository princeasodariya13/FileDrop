import { Router } from "express";
import { getFileInfo, generateDownload, deleteFile } from "@/controllers/download.controller";
import { fileInfoLimiter, downloadUrlLimiter } from "@/middleware/rateLimit";

const router = Router();

router.get("/:fileId", fileInfoLimiter, getFileInfo);
router.post("/:fileId/download", downloadUrlLimiter, generateDownload);
router.delete("/:fileId", fileInfoLimiter, deleteFile);

export default router;
