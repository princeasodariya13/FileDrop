import { Router } from "express";
import { getStorageSnapshot } from "@/services/storageReservation.service";
import { ok } from "@/utils/apiResponse";

const router = Router();

// Lets the frontend show "temporary storage is full" proactively before upload starts.
router.get("/status", async (_req, res, next) => {
  try {
    const snapshot = await getStorageSnapshot();
    return ok(res, snapshot);
  } catch (err) {
    next(err);
  }
});

export default router;
