import { Router } from "express";
import { getFileInfo, getFileInfoByCode, generateDownload, deleteFile } from "@/controllers/download.controller";
import { fileInfoLimiter, codeLookupLimiter, downloadUrlLimiter } from "@/middleware/rateLimit";

const router = Router();

router.get("/code/:code", codeLookupLimiter, getFileInfoByCode);
router.get("/:fileId", fileInfoLimiter, getFileInfo);
router.post("/:fileId/download", downloadUrlLimiter, generateDownload);
router.delete("/:fileId", fileInfoLimiter, deleteFile);

export default router;
