import { Schema, model, Document, Types } from "mongoose";

export interface IDownloadSession extends Document {
  sessionId: string;
  fileId: Types.ObjectId;
  leaseUntil: Date;
  status: "active" | "stale";
  createdAt: Date;
  updatedAt: Date;
}

const DownloadSessionSchema = new Schema<IDownloadSession>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    fileId: { type: Schema.Types.ObjectId, ref: "File", required: true, index: true },
    leaseUntil: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "stale"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

export const DownloadSessionModel = model<IDownloadSession>("DownloadSession", DownloadSessionSchema);
