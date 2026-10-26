import { z } from "zod";
import { env } from "@/config/env";

export const createUploadSessionSchema = z.object({
  fileName: z.string().min(1).max(255),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(env.maxFileSizeBytes, { message: "File exceeds the maximum allowed size." }),
  mimeType: z.string().min(1).max(255),
  expirationSeconds: z
    .number()
    .int()
    .min(60, { message: "Expiration must be at least 1 minute." })
    .max(43200, { message: "Expiration cannot exceed 12 hours." })
    .optional(),
  downloadLimit: z.number().int().positive().max(1000).nullable().optional(),
});

export type CreateUploadSessionInput = z.infer<typeof createUploadSessionSchema>;

export const completeUploadSchema = z.object({
  sessionId: z.string().min(1).max(100),
  code: z.string().optional(),
  bundleId: z.string().optional(),
  expirationSeconds: z
    .number()
    .int()
    .min(60, { message: "Expiration must be at least 1 minute." })
    .max(43200, { message: "Expiration cannot exceed 12 hours." })
    .optional(),
  downloadLimit: z.number().int().positive().max(1000).nullable().optional(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive(),
        etag: z.string().min(1).max(255),
      })
    )
    .min(1)
    .max(10000),
});

export const abortUploadSchema = z.object({
  sessionId: z.string().min(1).max(100),
});

export const heartbeatUploadSchema = z.object({
  sessionId: z.string().min(1).max(100),
});
