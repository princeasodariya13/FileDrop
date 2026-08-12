import mongoose from "mongoose";
import { createApp } from "../src/app";
import { env } from "../src/config/env";

let cachedDb: typeof mongoose | null = null;

const app = createApp();

export default async function handler(req: any, res: any) {
  if (!cachedDb) {
    cachedDb = await mongoose.connect(env.mongoUri);
  }
  
  // Express handles the request
  return app(req, res);
}
