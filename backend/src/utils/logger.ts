import pino from "pino";
import { env } from "@/config/env";

export const logger = pino({
  level: env.nodeEnv === "production" ? "info" : "debug",
  redact: {
    paths: ["req.headers.authorization", "*.r2SecretAccessKey", "*.presignedUrl", "*.password"],
    censor: "[REDACTED]",
  },
  transport:
    env.nodeEnv === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});
