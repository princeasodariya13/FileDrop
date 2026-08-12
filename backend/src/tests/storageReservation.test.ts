import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  reserveStorage,
  commitReservation,
  releaseReservation,
  getStorageSnapshot,
  InsufficientStorageError,
} from "@/services/storageReservation.service";
import { StorageLedgerModel, StorageReservationModel } from "@/models/StorageReservation.model";

// The PRD's canonical scenario runs against env.maxActiveStorageBytes (default 9GB
// from .env.example / test env). We set it explicitly here for a deterministic test.
process.env.MAX_ACTIVE_STORAGE = "13GB";

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await StorageLedgerModel.deleteMany({});
  await StorageReservationModel.deleteMany({});
});

const GB = 1024 ** 3;

describe("storage reservation", () => {
  it("accepts reservations that fit within capacity", async () => {
    await StorageLedgerModel.create({ _id: "singleton", activeBytes: 5 * GB, reservedBytes: 0 });

    const r1 = await reserveStorage(4 * GB);
    expect(r1.bytesReserved).toBe(4 * GB);

    const snapshot = await getStorageSnapshot();
    expect(snapshot.activeBytes + snapshot.reservedBytes).toBe(9 * GB);
  });

  it("rejects a reservation that would exceed capacity (5GB active + 4GB + 4GB > 13GB)", async () => {
    await StorageLedgerModel.create({ _id: "singleton", activeBytes: 5 * GB, reservedBytes: 0 });

    await reserveStorage(4 * GB); // -> 9GB used, within 13GB cap
    await expect(reserveStorage(4 * GB)).rejects.toBeInstanceOf(InsufficientStorageError); // -> would be 13GB... check boundary
  });

  it("prevents overshoot under concurrent reservation requests (no race window)", async () => {
    await StorageLedgerModel.create({ _id: "singleton", activeBytes: 5 * GB, reservedBytes: 0 });

    // Fire many concurrent 1GB reservation requests. Capacity for reservedBytes is 8GB
    // (13GB cap - 5GB active), so only 8 of these should succeed.
    const attempts = Array.from({ length: 20 }, () => reserveStorage(1 * GB).catch(() => null));
    const results = await Promise.all(attempts);
    const succeeded = results.filter((r) => r !== null);

    expect(succeeded.length).toBe(8);

    const snapshot = await getStorageSnapshot();
    expect(snapshot.activeBytes + snapshot.reservedBytes).toBe(13 * GB);
  });

  it("commit moves bytes from reserved to active", async () => {
    await StorageLedgerModel.create({ _id: "singleton", activeBytes: 0, reservedBytes: 0 });
    const reservation = await reserveStorage(2 * GB);
    await commitReservation(reservation._id as never);

    const snapshot = await getStorageSnapshot();
    expect(snapshot.activeBytes).toBe(2 * GB);
    expect(snapshot.reservedBytes).toBe(0);
  });

  it("release frees reserved bytes without touching active", async () => {
    await StorageLedgerModel.create({ _id: "singleton", activeBytes: 1 * GB, reservedBytes: 0 });
    const reservation = await reserveStorage(2 * GB);
    await releaseReservation(reservation._id as never);

    const snapshot = await getStorageSnapshot();
    expect(snapshot.activeBytes).toBe(1 * GB);
    expect(snapshot.reservedBytes).toBe(0);
  });

  it("release is idempotent (double release does not double-free)", async () => {
    await StorageLedgerModel.create({ _id: "singleton", activeBytes: 0, reservedBytes: 0 });
    const reservation = await reserveStorage(2 * GB);
    await releaseReservation(reservation._id as never);
    await releaseReservation(reservation._id as never);

    const snapshot = await getStorageSnapshot();
    expect(snapshot.reservedBytes).toBe(0);
  });
});
