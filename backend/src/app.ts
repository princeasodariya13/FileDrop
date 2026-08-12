import express from "express";
import mongoose from "mongoose";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import mongoSanitize from "express-mongo-sanitize";
import { env } from "@/config/env";
import { generalLimiter } from "@/middleware/rateLimit";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler";
import uploadRoutes from "@/routes/upload.routes";
import fileRoutes from "@/routes/file.routes";
import storageRoutes from "@/routes/storage.routes";

export function createApp() {
  const app = express();

  // Trust the first hop (reverse proxy) so rate limiting uses the real client IP.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendOrigin,
      credentials: false,
    })
  );
  app.use(express.json({ limit: "1mb" })); // metadata only — file bytes never pass through Express
  app.use(mongoSanitize()); // Prevent NoSQL injection
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
  app.use(generalLimiter);

  app.get("/health", (_req, res) => {
    const states = ["disconnected", "connected", "connecting", "disconnecting", "uninitialized"];
    const dbState = states[mongoose.connection.readyState] || "unknown";
    res.json({
      success: true,
      data: {
        api: "ok",
        database: dbState,
      },
    });
  });

  // Vercel Cron Endpoint
  app.get("/api/cron/cleanup", async (req, res) => {
    // Vercel sets this header for authorized cron requests
    const authHeader = req.headers.authorization;
    if (env.nodeEnv === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized cron execution" });
    }
    try {
      const { runCleanupPass } = await import("@/jobs/cleanup.job");
      await runCleanupPass();
      res.status(200).json({ success: true, message: "Cleanup pass completed successfully" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.use("/api/uploads", uploadRoutes);
  app.use("/api/files", fileRoutes);
  app.use("/api/storage", storageRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
