import { NextFunction, Request, Response } from "express";
import { ApiError } from "@/utils/apiResponse";
import { InsufficientStorageError } from "@/services/storageReservation.service";
import { logger } from "@/utils/logger";
import { ZodError } from "zod";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "The requested resource was not found." },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: err.errors[0]?.message ?? "Invalid input." },
    });
  }

  if (err instanceof InsufficientStorageError) {
    return res.status(507).json({
      success: false,
      error: {
        code: "STORAGE_FULL",
        message: "Temporary storage is currently full. Please try again later.",
      },
    });
  }

  logger.error({ err }, "Unhandled error");

  // Never leak stack traces or internal details to the client.
  return res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  });
}
