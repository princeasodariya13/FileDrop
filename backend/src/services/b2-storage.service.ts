import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  NotFound
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, assertB2ConfigPresent } from "@/config/env";
import { IStorageService, MultipartPart } from "./storage.service";
import { logger } from "@/utils/logger";

export class B2StorageService implements IStorageService {
  private client: S3Client;

  constructor() {
    assertB2ConfigPresent();

    // Extract region from B2 endpoint (e.g., https://s3.us-west-004.backblazeb2.com -> us-west-004)
    // If it fails to parse, fallback to us-east-1 to satisfy the AWS SDK requirement
    let region = "us-east-1";
    try {
      const url = new URL(env.b2Endpoint);
      const parts = url.hostname.split(".");
      if (parts.length > 1) {
        region = parts[1];
      }
    } catch (err) {
      // Ignore URL parsing errors and fallback
    }

    this.client = new S3Client({
      endpoint: env.b2Endpoint.startsWith("http") ? env.b2Endpoint : `https://${env.b2Endpoint}`,
      region,
      credentials: {
        accessKeyId: env.b2KeyId,
        secretAccessKey: env.b2ApplicationKey,
      },
      // B2 S3 compatibility requires this to ensure paths are correct
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: env.b2BucketName,
        Key: key,
        ContentType: contentType,
      });
      const response = await this.client.send(command);
      if (!response.UploadId) {
        throw new Error("B2 failed to return an UploadId");
      }
      return response.UploadId;
    } catch (err: any) {
      logger.error({ err, key }, "B2 createMultipartUpload failed");
      throw new Error(`STORAGE_UPLOAD_FAILED: ${err.message}`);
    }
  }

  async presignUploadParts(key: string, uploadId: string, totalParts: number): Promise<MultipartPart[]> {
    try {
      const parts: MultipartPart[] = [];
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const command = new UploadPartCommand({
          Bucket: env.b2BucketName,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        });
        
        const presignedUrl = await getSignedUrl(this.client, command, {
          expiresIn: env.presignedUrlTtlSeconds,
        });

        parts.push({
          partNumber,
          presignedUrl,
        });
      }
      return parts;
    } catch (err: any) {
      logger.error({ err, key, uploadId }, "B2 presignUploadParts failed");
      throw new Error(`STORAGE_UPLOAD_FAILED: ${err.message}`);
    }
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void> {
    try {
      const command = new CompleteMultipartUploadCommand({
        Bucket: env.b2BucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            PartNumber: p.partNumber,
            // Ensure ETags are properly quoted if they aren't already, B2 S3 API expects them
            ETag: p.etag.includes('"') ? p.etag : `"${p.etag}"`,
          })),
        },
      });
      await this.client.send(command);
    } catch (err: any) {
      logger.error({ err, key, uploadId }, "B2 completeMultipartUpload failed");
      throw new Error(`STORAGE_COMPLETE_FAILED: ${err.message}`);
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: env.b2BucketName,
        Key: key,
        UploadId: uploadId,
      });
      await this.client.send(command);
    } catch (err: any) {
      logger.error({ err, key, uploadId }, "B2 abortMultipartUpload failed");
      throw new Error(`STORAGE_ABORT_FAILED: ${err.message}`);
    }
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: env.b2BucketName,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (err: any) {
      if (err instanceof NotFound || err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      logger.error({ err, key }, "B2 objectExists check failed");
      return false;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: env.b2BucketName,
        Key: key,
      });
      await this.client.send(command);
    } catch (err: any) {
      logger.error({ err, key }, "B2 deleteObject failed");
      throw new Error(`STORAGE_DELETE_FAILED: ${err.message}`);
    }
  }

  async presignDownloadUrl(key: string, downloadFilename: string): Promise<string> {
    try {
      // Properly format Content-Disposition to preserve original filename during download
      // ASCII characters only for filename, fallback to encodeURIComponent for others
      const encodedFilename = encodeURIComponent(downloadFilename).replace(/['()]/g, escape).replace(/\*/g, '%2A');
      const contentDisposition = `attachment; filename="${downloadFilename.replace(/"/g, "")}"; filename*=UTF-8''${encodedFilename}`;

      const command = new GetObjectCommand({
        Bucket: env.b2BucketName,
        Key: key,
        ResponseContentDisposition: contentDisposition,
      });

      const presignedUrl = await getSignedUrl(this.client, command, {
        expiresIn: env.presignedUrlTtlSeconds,
      });
      return presignedUrl;
    } catch (err: any) {
      logger.error({ err, key }, "B2 presignDownloadUrl failed");
      throw new Error(`STORAGE_DOWNLOAD_FAILED: ${err.message}`);
    }
  }
}
