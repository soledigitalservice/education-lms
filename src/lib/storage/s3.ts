import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { env, isStorageConfigured } from '../env';

/**
 * S3 client singleton. Built on demand so apps that don't configure S3
 * (e.g. running just auth + courses) don't pay the import cost at module load.
 *
 * Compatible with: AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces,
 * MinIO, and any other service that speaks the S3 API.
 */
let cachedClient: S3Client | null = null;

export function getS3(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      'Object storage is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY in your .env.local. See README → "Cloudflare R2 setup".',
    );
  }
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: env.S3_REGION ?? 'auto',
      endpoint: env.S3_ENDPOINT,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY!,
        secretAccessKey: env.S3_SECRET_KEY!,
      },
      // Path-style addressing for MinIO and most non-AWS S3-compatible providers.
      // R2 and AWS S3 accept it too.
      forcePathStyle: true,
    });
  }
  return cachedClient;
}

export const BUCKET = (): string => {
  if (!env.S3_BUCKET) {
    throw new Error('S3_BUCKET is not configured');
  }
  return env.S3_BUCKET;
};

// ---- Presigned URLs ----------------------------------------------------

/**
 * Issue a presigned PUT URL valid for `expiresInSec` seconds.
 *
 * The browser PUTs the file directly to the bucket — your server doesn't
 * touch the bytes. This works on Vercel (no body-size limit), scales to
 * arbitrarily large files, and keeps egress out of your serverless budget.
 *
 * Note: `Content-Type` is signed into the URL. The client MUST send the
 * exact same `Content-Type` header in the PUT request, otherwise S3
 * rejects with SignatureDoesNotMatch.
 */
export async function presignUpload(opts: {
  key: string;
  contentType: string;
  expiresInSec?: number;
}): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET(),
    Key: opts.key,
    ContentType: opts.contentType,
  });
  return getSignedUrl(getS3(), cmd, { expiresIn: opts.expiresInSec ?? 600 });
}

/**
 * Issue a presigned GET URL valid for `expiresInSec` seconds.
 *
 * If S3_PUBLIC_URL is set (R2 custom domain, CloudFront, etc.) and the
 * object lives under a publicly-readable prefix, callers can skip this
 * and link to `${S3_PUBLIC_URL}/${key}` directly. We always presign here
 * because LMS materials are access-controlled per enrollment.
 */
export async function presignDownload(opts: {
  key: string;
  expiresInSec?: number;
  /// Optional download filename for Content-Disposition.
  downloadFilename?: string;
}): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET(),
    Key: opts.key,
    ResponseContentDisposition: opts.downloadFilename
      ? `attachment; filename="${sanitizeFilename(opts.downloadFilename)}"`
      : undefined,
  });
  return getSignedUrl(getS3(), cmd, { expiresIn: opts.expiresInSec ?? 600 });
}

export async function deleteObject(key: string): Promise<void> {
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET(), Key: key });
  await getS3().send(cmd);
}

// ---- Helpers -----------------------------------------------------------

/** Strip filename chars unsafe inside an HTTP header. */
function sanitizeFilename(name: string): string {
  return name.replace(/[\r\n"\\]/g, '').slice(0, 240);
}
