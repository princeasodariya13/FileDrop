import { Schema, model, Document } from "mongoose";

/**
 * Individual reservation record — one per in-flight upload session.
 * This is the audit trail; the atomic counters live on StorageLedger.
 */
export type ReservationStatus = "reserved" | "committed" | "released";

export interface IStorageReservation extends Document {
  bytesReserved: number;
  status: ReservationStatus;
  expiresAt: Date; // reservation TTL — if not committed/released by then, cleanup job reclaims it
  createdAt: Date;
  updatedAt: Date;
}

const StorageReservationSchema = new Schema<IStorageReservation>(
  {
    bytesReserved: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["reserved", "committed", "released"],
      default: "reserved",
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

export const StorageReservationModel = model<IStorageReservation>(
  "StorageReservation",
  StorageReservationSchema
);

/**
 * StorageLedger is a SINGLETON document (one row, _id: "singleton") that holds
 * the atomic counters for the whole system. All mutations to activeBytes /
 * reservedBytes go through findOneAndUpdate with $inc so concurrent requests
 * can never race each other (MongoDB guarantees per-document atomicity).
 */
export interface IStorageLedger extends Omit<Document, "_id"> {
  _id: string;
  activeBytes: number; // bytes backed by completed, active files
  reservedBytes: number; // bytes held by in-flight (not-yet-completed) uploads
}

const StorageLedgerSchema = new Schema<IStorageLedger>({
  _id: { type: String, default: "singleton" },
  activeBytes: { type: Number, default: 0, min: 0 },
  reservedBytes: { type: Number, default: 0, min: 0 },
});

export const StorageLedgerModel = model<IStorageLedger>("StorageLedger", StorageLedgerSchema);
