// ═══════════════════════════════════════════════════════
// Cloudflare R2 Client — S3-compatible object storage
// ═══════════════════════════════════════════════════════
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKey = process.env.CLOUDFLARE_R2_ACCESS_KEY;
const secretKey = process.env.CLOUDFLARE_R2_SECRET_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "neurox-uploads";

if (!accountId || !accessKey || !secretKey) {
  console.warn("[R2] Missing Cloudflare R2 credentials — file uploads disabled");
}

export const r2Client = accountId && accessKey && secretKey
  ? new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    })
  : null;

/**
 * Upload a buffer to R2 and return the object key.
 * @param {Buffer} buffer - File buffer to upload
 * @param {string} key    - Object key (e.g. "scans/NRX-xxx/123456.webp")
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} The R2 object key
 */
export async function uploadToR2(buffer, key, contentType = "image/webp") {
  if (!r2Client) {
    console.warn("[R2] Client not initialized — skipping upload");
    return null;
  }

  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return key;
}

export { bucketName };
