import mongoose from "mongoose";
import { createApp } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { scheduleCleanupJob } from "@/jobs/cleanup.job";

async function main() {
  await mongoose.connect(env.mongoUri);
  logger.info("Connected to MongoDB");

  const app = createApp();

  app.listen(env.port, () => {
    logger.info(`FileDrop API listening on port ${env.port} (${env.nodeEnv})`);
  });

  scheduleCleanupJob();
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
