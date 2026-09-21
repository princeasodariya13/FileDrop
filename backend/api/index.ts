import mongoose from "mongoose";
import { createApp } from "../src/app";
import { env } from "../src/config/env";

let isConnected = false;

async function connectToDatabase() {
  if (isConnected && mongoose.connection.readyState === 1) return;
  await mongoose.connect(env.mongoUri);
  isConnected = true;
}

const app = createApp();

export default async function handler(req: any, res: any) {
  await connectToDatabase();
  return app(req, res);
}
