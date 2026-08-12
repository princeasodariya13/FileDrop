import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, assertR2ConfigPresent } from "@/config/env";

let client: S3Client | null = null;

function getClient(): S3Client {
  assertR2ConfigPresent();
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: env.r2Endpoint,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }
  return client;
}

export interface MultipartPart {
  partNumber: number;
  presignedUrl: string;
}

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const res = await getClient().send(
    new CreateMultipartUploadCommand({
      Bucket: env.r2BucketName,
      Key: key,
      ContentType: contentType,
    })
  );
  if (!res.UploadId) throw new Error("R2 did not return an UploadId");
  return res.UploadId;
}

export async function presignUploadParts(
  key: string,
  uploadId: string,
  totalParts: number
): Promise<MultipartPart[]> {
  const parts: MultipartPart[] = [];
  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    const command = new UploadPartCommand({
      Bucket: env.r2BucketName,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const presignedUrl = await getSignedUrl(getClient(), command, {
      expiresIn: env.presignedUrlTtlSeconds,
    });
    parts.push({ partNumber, presignedUrl });
  }
  return parts;
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
): Promise<void> {
  await getClient().send(
    new CompleteMultipartUploadCommand({
      Bucket: env.r2BucketName,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    })
  );
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await getClient().send(
    new AbortMultipartUploadCommand({
      Bucket: env.r2BucketName,
      Key: key,
      UploadId: uploadId,
    })
  );
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: env.r2BucketName, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: env.r2BucketName, Key: key }));
}

export async function presignDownloadUrl(key: string, downloadFilename: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.r2BucketName,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${downloadFilename}"`,
  });
  return getSignedUrl(getClient(), command, { expiresIn: env.presignedUrlTtlSeconds });
}
