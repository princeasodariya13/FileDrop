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
 * Atomically checks and reserves `bytes` on the singleton storage ledger.
 * This provides the atomic capacity guard in a single fast DB round trip.
 */
export async function reserveLedger(bytes: number): Promise<void> {
  const cap = env.maxActiveStorageBytes;

  let updated = await StorageLedgerModel.findOneAndUpdate(
    {
      _id: "singleton",
      $expr: { $lte: [{ $add: ["$activeBytes", "$reservedBytes", bytes] }, cap] },
    },
    { $inc: { reservedBytes: bytes } },
    { new: true }
  );

  if (!updated) {
    const existingLedger = await StorageLedgerModel.findById("singleton");
    if (!existingLedger) {
      await getOrCreateLedger();
      updated = await StorageLedgerModel.findOneAndUpdate(
        {
          _id: "singleton",
          $expr: { $lte: [{ $add: ["$activeBytes", "$reservedBytes", bytes] }, cap] },
        },
        { $inc: { reservedBytes: bytes } },
        { new: true }
      );
    }
    if (!updated) {
      throw new InsufficientStorageError();
    }
  }
}

/**
 * Rolls back reserved bytes on the ledger if upload creation fails.
 */
export async function releaseLedgerBytes(bytes: number): Promise<void> {
  await StorageLedgerModel.updateOne(
    { _id: "singleton" },
    { $inc: { reservedBytes: -bytes } }
  ).catch(() => {});
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
export async function reserveStorage(bytes: number, customId?: Types.ObjectId): Promise<IStorageReservation> {
  await reserveLedger(bytes);

  const reservation = await StorageReservationModel.create({
    _id: customId || new Types.ObjectId(),
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
