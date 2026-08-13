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
  expirationSeconds: z.number().int().refine((val) => [60, 900, 1800, 2700, 3600, 7200].includes(val), { message: "Invalid expiration duration." }).optional(),
  downloadLimit: z.number().int().positive().max(1000).nullable().optional(),
});

export type CreateUploadSessionInput = z.infer<typeof createUploadSessionSchema>;

export const completeUploadSchema = z.object({
  sessionId: z.string().min(1).max(100),
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
