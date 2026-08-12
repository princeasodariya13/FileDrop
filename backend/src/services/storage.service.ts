import { logger } from "@/utils/logger";

export interface MultipartPart {
  partNumber: number;
  presignedUrl: string;
}

export interface IStorageService {
  createMultipartUpload(key: string, contentType: string): Promise<string>;
  presignUploadParts(key: string, uploadId: string, totalParts: number): Promise<MultipartPart[]>;
  completeMultipartUpload(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  presignDownloadUrl(key: string, downloadFilename: string): Promise<string>;
}

export class MockStorageService implements IStorageService {
  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    logger.info({ key, contentType }, "MockStorageService: createMultipartUpload");
    return "mock-upload-id-" + Date.now();
  }

  async presignUploadParts(key: string, uploadId: string, totalParts: number): Promise<MultipartPart[]> {
    logger.info({ key, uploadId, totalParts }, "MockStorageService: presignUploadParts");
    const parts: MultipartPart[] = [];
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      parts.push({
        partNumber,
        presignedUrl: `http://localhost:5000/mock-storage/upload/${uploadId}/${partNumber}`,
      });
    }
    return parts;
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void> {
    logger.info({ key, uploadId, partsCount: parts.length }, "MockStorageService: completeMultipartUpload");
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    logger.info({ key, uploadId }, "MockStorageService: abortMultipartUpload");
  }

  async objectExists(key: string): Promise<boolean> {
    logger.info({ key }, "MockStorageService: objectExists");
    return true;
  }

  async deleteObject(key: string): Promise<void> {
    logger.info({ key }, "MockStorageService: deleteObject");
  }

  async presignDownloadUrl(key: string, downloadFilename: string): Promise<string> {
    logger.info({ key, downloadFilename }, "MockStorageService: presignDownloadUrl");
    return `http://localhost:5000/mock-storage/download/${encodeURIComponent(key)}`;
  }
}

// Storage abstraction layer: Do NOT execute Cloudflare R2 yet.
// For now, use the MockStorageService to keep the backend provider-independent.
export const storage: IStorageService = new MockStorageService();
