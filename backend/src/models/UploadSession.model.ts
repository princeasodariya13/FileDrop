import { Schema, model, Document, Types } from "mongoose";

export type UploadSessionStatus =
  | "initializing"
  | "uploading"
  | "completing"
  | "completed"
  | "aborted"
  | "failed";

export interface IUploadSession extends Document {
  sessionId: string;
  storageKey: string;
  storageUploadId: string; // multipart upload id
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  partSizeBytes: number;
  totalParts: number;
  status: UploadSessionStatus;
  reservationId: Types.ObjectId;
  downloadLimit: number | null;
  expirationHours: number;
  clientIp: string;
  createdAt: Date;
  updatedAt: Date;
}

const UploadSessionSchema = new Schema<IUploadSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    storageKey: { type: String, required: true },
    storageUploadId: { type: String, required: true },
    originalName: { type: String, required: true, maxlength: 255 },
    sizeBytes: { type: Number, required: true, min: 1 },
    mimeType: { type: String, required: true },
    partSizeBytes: { type: Number, required: true },
    totalParts: { type: Number, required: true },
    status: {
      type: String,
      enum: ["initializing", "uploading", "completing", "completed", "aborted", "failed"],
      default: "initializing",
      index: true,
    },
    reservationId: { type: Schema.Types.ObjectId, ref: "StorageReservation", required: true },
    downloadLimit: { type: Number, default: null },
    expirationHours: { type: Number, required: true },
    clientIp: { type: String, required: true },
  },
  { timestamps: true }
);

// Abandoned sessions are swept by the cleanup job based on updatedAt + status.
UploadSessionSchema.index({ status: 1, updatedAt: 1 });

export const UploadSessionModel = model<IUploadSession>("UploadSession", UploadSessionSchema);
