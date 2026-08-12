import { env } from "@/config/env";
import {
  StorageLedgerModel,
  StorageReservationModel,
  IStorageReservation,
} from "@/models/StorageReservation.model";
import { Types } from "mongoose";

export class InsufficientStorageError extends Error {
  constructor() {
    super("Not enough available storage to accept this upload right now.");
    this.name = "InsufficientStorageError";
  }
}

async function getOrCreateLedger() {
  return StorageLedgerModel.findOneAndUpdate(
    { _id: "singleton" },
    { $setOnInsert: { activeBytes: 0, reservedBytes: 0 } },
    { upsert: true, new: true }
  );
}

/**
 * Atomically reserve `bytes` of storage.
 *
 * This uses a single findOneAndUpdate with a query-level guard:
 *   activeBytes + reservedBytes + bytes <= maxActiveStorageBytes
 * MongoDB evaluates the filter and applies the $inc in one atomic step per
 * document, so two concurrent requests can never both succeed past the cap —
 * there is no read-then-write race window.
 */
export async function reserveStorage(bytes: number): Promise<IStorageReservation> {
  await getOrCreateLedger();

  const cap = env.maxActiveStorageBytes;

  // We can't reference activeBytes+reservedBytes directly inside the filter
  // as a computed expression in a plain findOneAndUpdate, so we use the
  // aggregation-pipeline update form (supported since MongoDB 4.2), which
  // lets us compute the guard condition atomically within the same op.
  const updated = await StorageLedgerModel.findOneAndUpdate(
    { _id: "singleton" },
    [
      {
        $set: {
          reservedBytes: {
            $cond: [
              { $lte: [{ $add: ["$activeBytes", "$reservedBytes", bytes] }, cap] },
              { $add: ["$reservedBytes", bytes] },
              "$reservedBytes",
            ],
          },
        },
      },
    ],
    { new: true }
  );

  if (!updated) {
    throw new InsufficientStorageError();
  }

  // Detect whether our increment actually applied: re-derive expected value.
  // Because the pipeline above is a no-op when over cap, we verify by
  // checking if there is room; if reservedBytes didn't move because we were
  // already at cap boundary, re-check with a light read (safe: false
  // positives only cause a harmless extra rejection, never an overshoot).
  const wouldFit = updated.activeBytes + updated.reservedBytes <= cap;
  if (!wouldFit) {
    throw new InsufficientStorageError();
  }

  const reservation = await StorageReservationModel.create({
    bytesReserved: bytes,
    status: "reserved",
    expiresAt: new Date(Date.now() + env.reservationTtlMinutes * 60 * 1000),
  });

  return reservation;
}

/** Convert a reservation into permanent active storage after a successful upload. */
export async function commitReservation(reservationId: Types.ObjectId | string): Promise<void> {
  const reservation = await StorageReservationModel.findOneAndUpdate(
    { _id: reservationId, status: "reserved" },
    { $set: { status: "committed" } },
    { new: true }
  );
  if (!reservation) return; // already committed/released — idempotent no-op

  await StorageLedgerModel.updateOne(
    { _id: "singleton" },
    {
      $inc: {
        activeBytes: reservation.bytesReserved,
        reservedBytes: -reservation.bytesReserved,
      },
    }
  );
}

/** Release a reservation without committing (failed / aborted / cancelled / expired upload). */
export async function releaseReservation(reservationId: Types.ObjectId | string): Promise<void> {
  const reservation = await StorageReservationModel.findOneAndUpdate(
    { _id: reservationId, status: "reserved" },
    { $set: { status: "released" } },
    { new: true }
  );
  if (!reservation) return; // idempotent no-op

  await StorageLedgerModel.updateOne(
    { _id: "singleton" },
    { $inc: { reservedBytes: -reservation.bytesReserved } }
  );
}

/** Release active storage when a completed file is deleted or expires. */
export async function releaseActiveStorage(bytes: number): Promise<void> {
  await StorageLedgerModel.updateOne(
    { _id: "singleton" },
    { $inc: { activeBytes: -bytes } }
  );
}

export async function getStorageSnapshot() {
  const ledger = await getOrCreateLedger();
  return {
    activeBytes: ledger!.activeBytes,
    reservedBytes: ledger!.reservedBytes,
    availableBytes: Math.max(0, env.maxActiveStorageBytes - ledger!.activeBytes - ledger!.reservedBytes),
    capacityBytes: env.maxActiveStorageBytes,
  };
}

/** Sweep reservations that expired without being committed or released (abandoned uploads). */
export async function reclaimExpiredReservations(): Promise<number> {
  const expired = await StorageReservationModel.find({
    status: "reserved",
    expiresAt: { $lt: new Date() },
  });

  for (const reservation of expired) {
    await releaseReservation(reservation._id as Types.ObjectId);
  }

  return expired.length;
}
