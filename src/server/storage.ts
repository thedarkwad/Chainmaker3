import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// Backblaze B2 client (S3-compatible API)
// ---------------------------------------------------------------------------

let client: S3Client | null = null;

function getStorageClient(): S3Client {
  if (client) return client;

  const keyId = process.env.BACKBLAZE_KEY_ID;
  const appKey = process.env.BACKBLAZE_APP_KEY;
  // e.g. "https://s3.us-west-004.backblazeb2.com"
  const endpoint = process.env.BACKBLAZE_ENDPOINT;

  if (!keyId || !appKey || !endpoint) {
    throw new Error(
      "Backblaze B2 environment variables are not set (BACKBLAZE_KEY_ID, BACKBLAZE_APP_KEY, BACKBLAZE_ENDPOINT)",
    );
  }

  client = new S3Client({
    endpoint,
    region: "auto",
    credentials: { accessKeyId: keyId, secretAccessKey: appKey },
  });
  return client;
}

function getBucket(): string {
  const bucket = process.env.BACKBLAZE_BUCKET_NAME;
  if (!bucket) throw new Error("BACKBLAZE_BUCKET_NAME environment variable is not set");
  return bucket;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Uploads a file to Backblaze B2 and returns its public URL.
 * `key` should be a unique path, e.g. "images/{userId}/{uuid}.webp"
 */
export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ url: string; fileId: string }> {
  const s3 = getStorageClient();
  const bucket = getBucket();

  const result = await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  const publicUrl = process.env.BACKBLAZE_PUBLIC_URL;
  if (!publicUrl) throw new Error("BACKBLAZE_PUBLIC_URL environment variable is not set");

  return {
    url: `${publicUrl}/${key}`,
    // VersionId doubles as the Backblaze fileId for the S3-compat API
    fileId: result.VersionId ?? key,
  };
}

/**
 * Deletes a file from Backblaze B2 by its storage key.
 */
export async function deleteFile(key: string): Promise<void> {
  const s3 = getStorageClient();
  await s3.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}
