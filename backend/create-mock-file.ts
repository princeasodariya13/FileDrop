import { FileModel } from "./src/models/File.model";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("Connected to MongoDB.");

  const fileId = "test99999999";
  await FileModel.create({
    fileId,
    originalName: "test-file.txt",
    sanitizedName: "test-file.txt",
    sizeBytes: 100,
    mimeType: "text/plain",
    storageKey: "files/test99999999/test-file.txt",
    possessionToken: "12345",
    status: "active",
    downloadLimit: null,
    downloadCount: 0,
    expiresAt: new Date(Date.now() + 86400000),
  });
  console.log("Created mock file test99999999 in DB.");
  await mongoose.disconnect();
}
run();
