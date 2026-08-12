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

  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName: process.env.R2_BUCKET_NAME ?? "",
  r2Endpoint: process.env.R2_ENDPOINT ?? "",

  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",

  maxFileSizeBytes: bytesFromSizeString(process.env.MAX_FILE_SIZE ?? "10GB"),
  maxActiveStorageBytes: bytesFromSizeString(process.env.MAX_ACTIVE_STORAGE ?? "9GB"),

  defaultExpirationHours: parseInt(process.env.DEFAULT_EXPIRATION_HOURS ?? "24", 10),
  maxExpirationHours: parseInt(process.env.MAX_EXPIRATION_HOURS ?? "168", 10),

  reservationTtlMinutes: parseInt(process.env.RESERVATION_TTL_MINUTES ?? "60", 10),
  multipartPartSizeBytes: bytesFromSizeString(process.env.MULTIPART_PART_SIZE ?? "16MB"),
  presignedUrlTtlSeconds: parseInt(process.env.PRESIGNED_URL_TTL_SECONDS ?? "900", 10),

  rateLimitUploadPerHour: parseInt(process.env.RATE_LIMIT_UPLOAD_PER_HOUR ?? "20", 10),
  rateLimitDownloadPerHour: parseInt(process.env.RATE_LIMIT_DOWNLOAD_PER_HOUR ?? "60", 10),
};

export function assertR2ConfigPresent(): void {
  const r2Fields: Record<string, string> = {
    r2AccountId: env.r2AccountId,
    r2AccessKeyId: env.r2AccessKeyId,
    r2SecretAccessKey: env.r2SecretAccessKey,
    r2BucketName: env.r2BucketName,
    r2Endpoint: env.r2Endpoint,
  };
  const missing = Object.entries(r2Fields)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `Cloudflare R2 is not configured. Missing: ${missing.join(", ")}. See .env.example.`
    );
  }
}
