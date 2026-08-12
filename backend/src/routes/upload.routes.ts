import { Router } from "express";
import { createUploadSession, refreshPartUrls, completeUpload, abortUpload } from "@/controllers/upload.controller";
import { uploadSessionLimiter } from "@/middleware/rateLimit";

const router = Router();

router.post("/session", uploadSessionLimiter, createUploadSession);
router.post("/:sessionId/parts/refresh", refreshPartUrls);
router.post("/complete", completeUpload);
router.post("/abort", abortUpload);

export default router;
