import { Schema, model, Document, Types } from "mongoose";

export type FileStatus = "active" | "expired" | "deleted" | "exhausted";

export interface IFile extends Document {
  fileId: string; // public-facing safe id (nanoid), used in share URLs
  originalName: string;
  sanitizedName: string;
  sizeBytes: number;
  mimeType: string;
  storageKey: string;
  possessionToken: string;
  status: FileStatus;
  downloadLimit: number | null; // null = unlimited
  downloadCount: number;
  expiresAt: Date;
  inactivityTimerStartsAt: Date;
  reservationId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const FileSchema = new Schema<IFile>(
  {
    fileId: { type: String, required: true, unique: true, index: true },
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
    expiresAt: { type: Date, required: true },
    inactivityTimerStartsAt: { type: Date, required: true },
    reservationId: { type: Schema.Types.ObjectId, ref: "StorageReservation", default: null },
  },
  { timestamps: true }
);

// TTL-style cleanup is handled by the cleanup job (not native Mongo TTL) so
// we can delete the R2 object first. This index just speeds up the query.
FileSchema.index({ status: 1, expiresAt: 1 });

export const FileModel = model<IFile>("File", FileSchema);
