import { Schema, model, Document, Types } from "mongoose";

export type FileStatus = "active" | "expired" | "deleted" | "exhausted";

export interface IFile extends Document {
  fileId: string; // public-facing safe id (nanoid), used in share URLs
  code?: string; // 6-digit random password/code for easy receiver lookup
  bundleId?: string; // batch upload identifier
  originalName: string;
  sanitizedName: string;
  sizeBytes: number;
  mimeType: string;
  storageKey: string;
  possessionToken: string;
  status: FileStatus;
  downloadLimit: number | null; // null = unlimited
  downloadCount: number; // legacy field for backward compatibility
  receiverIds: string[]; // unique receiver identities
  expiresAt: Date;
  inactivityTimerStartsAt: Date;
  reservationId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema<IFile>(
  {
    fileId: { type: String, required: true, unique: true, index: true },
    code: { type: String, index: true },
    bundleId: { type: String, index: true },
    originalName: { type: String, required: true, maxlength: 255 },
    sanitizedName: { type: String, required: true, maxlength: 255 },
    sizeBytes: { type: Number, required: true, min: 1 },
    mimeType: { type: String, required: true, maxlength: 255 },
    storageKey: { type: String, required: true, unique: true },
    possessionToken: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "expired", "deleted", "exhausted"],
      default: "active",
      index: true,
    },
    downloadLimit: { type: Number, default: null, min: 1 },
    downloadCount: { type: Number, default: 0, min: 0 },
    receiverIds: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
    inactivityTimerStartsAt: { type: Date, required: true, default: Date.now },
    reservationId: { type: Schema.Types.ObjectId, ref: "StorageReservation", default: null },
  },
  { timestamps: true }
);

// TTL-style cleanup is handled by the cleanup job (not native Mongo TTL) so
// we can delete the R2 object first. This index just speeds up the query.
FileSchema.index({ status: 1, expiresAt: 1 });

export const FileModel = model<IFile>("File", FileSchema);
