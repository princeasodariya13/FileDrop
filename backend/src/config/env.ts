import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function bytesFromSizeString(input: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i.exec(input.trim());
  if (!match) throw new Error(`Invalid size string: ${input}`);
  const value = parseFloat(match[1]);
  const unit = (match[2] ?? "B").toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return Math.floor(value * multipliers[unit]);
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "5000", 10),

  mongoUri: required("MONGODB_URI", "mongodb://localhost:27017/filedrop"),

  b2KeyId: process.env.B2_KEY_ID ?? "",
  b2ApplicationKey: process.env.B2_APPLICATION_KEY ?? "",
  b2BucketName: process.env.B2_BUCKET_NAME ?? "FileDrop",
  b2Endpoint: process.env.B2_ENDPOINT ?? "",

  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",

  maxFileSizeBytes: bytesFromSizeString(process.env.MAX_FILE_SIZE ?? "10GB"),
  maxActiveStorageBytes: bytesFromSizeString(process.env.MAX_ACTIVE_STORAGE ?? "9GB"),

  defaultExpirationHours: parseInt(process.env.DEFAULT_EXPIRATION_HOURS ?? "24", 10),
  maxExpirationHours: parseInt(process.env.MAX_EXPIRATION_HOURS ?? "168", 10),

  reservationTtlMinutes: parseInt(process.env.RESERVATION_TTL_MINUTES ?? "60", 10),
  abandonedUploadTimeoutMinutes: parseInt(process.env.ABANDONED_UPLOAD_TIMEOUT_MINUTES ?? "60", 10),
  multipartPartSizeBytes: bytesFromSizeString(process.env.MULTIPART_PART_SIZE ?? "64MB"),
  presignedUrlTtlSeconds: parseInt(process.env.PRESIGNED_URL_TTL_SECONDS ?? "900", 10),

  rateLimitUploadPerHour: parseInt(process.env.RATE_LIMIT_UPLOAD_PER_HOUR ?? "20", 10),
  rateLimitDownloadPerHour: parseInt(process.env.RATE_LIMIT_DOWNLOAD_PER_HOUR ?? "60", 10),
};

export function assertB2ConfigPresent(): void {
  const b2Fields: Record<string, string> = {
    b2KeyId: env.b2KeyId,
    b2ApplicationKey: env.b2ApplicationKey,
    b2BucketName: env.b2BucketName,
    b2Endpoint: env.b2Endpoint,
  };
  const missing = Object.entries(b2Fields)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `Backblaze B2 is not configured. Missing: ${missing.join(", ")}. See .env.example.`
    );
  }
}
