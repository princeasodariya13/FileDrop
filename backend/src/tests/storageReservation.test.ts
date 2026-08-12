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

import { env } from "@/config/env";

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

  it(`rejects a reservation that would exceed capacity (5GB active + 4GB + ... > cap)`, async () => {
    await StorageLedgerModel.create({ _id: "singleton", activeBytes: 5 * GB, reservedBytes: 0 });

    const remaining = env.maxActiveStorageBytes - 5 * GB;
    await reserveStorage(remaining); // -> cap reached
    await expect(reserveStorage(1 * GB)).rejects.toBeInstanceOf(InsufficientStorageError);
  });

  it("prevents overshoot under concurrent reservation requests (no race window)", async () => {
    await StorageLedgerModel.create({ _id: "singleton", activeBytes: 5 * GB, reservedBytes: 0 });

    const remaining = env.maxActiveStorageBytes - 5 * GB;
    const allowed = Math.floor(remaining / GB);

    const attempts = Array.from({ length: 20 }, () => reserveStorage(1 * GB).catch(() => null));
    const results = await Promise.all(attempts);
    const succeeded = results.filter((r) => r !== null);

    expect(succeeded.length).toBe(allowed);

    const snapshot = await getStorageSnapshot();
    expect(snapshot.activeBytes + snapshot.reservedBytes).toBe(env.maxActiveStorageBytes);
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
