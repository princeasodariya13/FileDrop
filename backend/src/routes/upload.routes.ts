import { Router } from "express";
import { createUploadSession, refreshPartUrls, completeUpload, abortUpload } from "@/controllers/upload.controller";
import { uploadSessionLimiter, partLimiter } from "@/middleware/rateLimit";

const router = Router();

router.post("/session", uploadSessionLimiter, createUploadSession);
router.post("/:sessionId/parts/refresh", partLimiter, refreshPartUrls);
router.post("/complete", partLimiter, completeUpload);
router.post("/abort", partLimiter, abortUpload);

export default router;
