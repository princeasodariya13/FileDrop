import mongoose from "mongoose";
import { createApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { scheduleCleanupJob } from "@/jobs/cleanup.job";

async function main() {
  await mongoose.connect(env.mongoUri);
  logger.info("Connected to MongoDB");

  const app = createApp();

  const server = app.listen(env.port, "0.0.0.0", () => {
    logger.info(`Server running on port ${env.port} (${env.nodeEnv})`);
  });

  const cleanupTask = scheduleCleanupJob();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    if (cleanupTask) cleanupTask.stop();
    server.close(async () => {
      logger.info("HTTP server closed.");
      await mongoose.connection.close();
      logger.info("MongoDB connection closed.");
      process.exit(0);
    });
    // Force shutdown if taking too long
    setTimeout(() => {
      logger.error("Could not close connections in time, forcefully shutting down");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
