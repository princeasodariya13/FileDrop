import { Schema, model, Document, Types } from "mongoose";

export interface IDownloadEvent extends Document {
  fileId: Types.ObjectId;
  ipHash: string; // hashed, never store raw IP
  userAgent: string;
  createdAt: Date;
}

const DownloadEventSchema = new Schema<IDownloadEvent>(
  {
    fileId: { type: Schema.Types.ObjectId, ref: "File", required: true, index: true },
    ipHash: { type: String, required: true },
    userAgent: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const DownloadEventModel = model<IDownloadEvent>("DownloadEvent", DownloadEventSchema);
