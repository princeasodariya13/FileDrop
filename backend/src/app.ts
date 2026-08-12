import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { env } from "@/config/env";
import { generalLimiter } from "@/middleware/rateLimit";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler";
import uploadRoutes from "@/routes/upload.routes";
import fileRoutes from "@/routes/file.routes";
import storageRoutes from "@/routes/storage.routes";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendOrigin,
      credentials: false,
    })
  );
  app.use(express.json({ limit: "1mb" })); // metadata only — file bytes never pass through Express
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
  app.use(generalLimiter);

  app.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));

  app.use("/api/uploads", uploadRoutes);
  app.use("/api/files", fileRoutes);
  app.use("/api/storage", storageRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
