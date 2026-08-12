import { Router } from "express";
import { getFileInfo, generateDownload, deleteFile } from "@/controllers/download.controller";
import { downloadLimiter } from "@/middleware/rateLimit";

const router = Router();

router.get("/:fileId", getFileInfo);
router.post("/:fileId/download", downloadLimiter, generateDownload);
router.delete("/:fileId", deleteFile);

export default router;
