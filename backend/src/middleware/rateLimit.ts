import rateLimit from "express-rate-limit";
import { env } from "@/config/env";

export const uploadSessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.rateLimitUploadPerHour,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many upload attempts. Please slow down." },
  },
});

export const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.rateLimitDownloadPerHour,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many download requests. Please slow down." },
  },
});

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
