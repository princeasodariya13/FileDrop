import { B2StorageService } from "./src/services/b2-storage.service";
import { logger } from "./src/utils/logger";
import dotenv from "dotenv";

// Load .env explicitly for the test
dotenv.config();

async function testB2() {
  logger.info("Starting B2 integration test...");
  try {
    const storage = new B2StorageService();
    const testKey = `test-upload-${Date.now()}.txt`;

    logger.info("1. Creating multipart upload...");
    const uploadId = await storage.createMultipartUpload(testKey, "text/plain");
    logger.info({ uploadId }, "Multipart upload created");

    logger.info("2. Presigning upload part...");
    const parts = await storage.presignUploadParts(testKey, uploadId, 1);
    logger.info({ partUrl: parts[0].presignedUrl.substring(0, 50) + "..." }, "Part presigned");

    logger.info("3. Aborting multipart upload (Cleanup)...");
    await storage.abortMultipartUpload(testKey, uploadId);
    logger.info("Multipart upload aborted");

    logger.info("4. Testing objectExists for non-existent file...");
    const exists = await storage.objectExists(testKey);
    logger.info({ exists }, "Object exists result (should be false)");

    logger.info("B2 test completed successfully!");
  } catch (err: any) {
    logger.error({ err }, "B2 test failed");
    process.exit(1);
  }
}

testB2();
