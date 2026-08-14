import { Router } from "express";
import { createUploadSession, refreshPartUrls, completeUpload, abortUpload, heartbeatUpload } from "@/controllers/upload.controller";
import { uploadSessionLimiter, partLimiter } from "@/middleware/rateLimit";

const router = Router();

router.post("/session", uploadSessionLimiter, createUploadSession);
router.post("/:sessionId/parts/refresh", partLimiter, refreshPartUrls);
router.post("/complete", partLimiter, completeUpload);
router.post("/abort", partLimiter, abortUpload);
router.post("/heartbeat", partLimiter, heartbeatUpload);

export default router;
