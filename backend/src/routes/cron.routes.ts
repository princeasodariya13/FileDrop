import { Router, Request, Response } from "express";
import { runCleanupPass } from "@/jobs/cleanup.job";
import { logger } from "@/utils/logger";

const router = Router();

/**
 * POST /api/cron/cleanup
 *
 * Called by Vercel Cron every minute (see vercel.json `crons` config).
 * Also safe to call manually for ad-hoc cleanup.
 *
 * Protected by Authorization: Bearer <CRON_SECRET>.
 * If CRON_SECRET is not set the route is disabled entirely (returns 503)
 * so it is never accidentally exposed without a secret.
 */
router.post("/cleanup", async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;

  // Refuse to operate without a configured secret — prevents accidental exposure
  if (!secret) {
    logger.warn("CRON_SECRET is not set — cron cleanup route is disabled");
    res.status(503).json({ success: false, error: { code: "CRON_DISABLED", message: "Cron secret not configured." } });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (provided !== secret) {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid cron secret." } });
    return;
  }

  try {
    const start = Date.now();
    await runCleanupPass();
    const ms = Date.now() - start;
    logger.info({ ms }, "Cron cleanup pass completed via HTTP trigger");
    res.json({ success: true, data: { durationMs: ms } });
  } catch (err: any) {
    logger.error({ err }, "Cron cleanup pass failed via HTTP trigger");
    res.status(500).json({ success: false, error: { code: "CLEANUP_FAILED", message: err?.message ?? "Cleanup failed." } });
  }
});

export default router;
