/**
 * Server-side file validation. We block obvious dangerous types and
 * cap upload sizes per kind.
 *
 * Caveats:
 *   - MIME type is client-supplied via the presigned URL. A malicious
 *     uploader can lie. We still validate because it catches accidents
 *     and pushes attackers towards more effort.
 *   - For documents that can carry payloads (PDF, DOCX), we rely on the
 *     browser viewer's sandbox + presigned URL expiry. We do NOT execute
 *     uploaded content server-side.
 */

import { ApiError } from '../api/errors';

/** Categorise uploads to apply per-kind size limits. */
export type UploadKind = 'file' | 'image' | 'video' | 'avatar';

/** Tightest practical whitelist of MIME types per kind. */
const MIME_BY_KIND: Record<UploadKind, ReadonlyArray<string | RegExp>> = {
  avatar: ['image/jpeg', 'image/png', 'image/webp'],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  file: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'application/json',
    'text/plain',
    'text/markdown',
    'text/csv',
    /^image\//,
    /^audio\//,
  ],
};

/** Per-kind size caps in bytes. */
const SIZE_LIMITS: Record<UploadKind, number> = {
  avatar: 2 * 1024 * 1024, //   2 MB
  image: 10 * 1024 * 1024, //  10 MB
  video: 500 * 1024 * 1024, // 500 MB
  file: 100 * 1024 * 1024, // 100 MB
};

export interface UploadValidationInput {
  kind: UploadKind;
  contentType: string;
  sizeBytes: number;
}

export function validateUpload(input: UploadValidationInput): void {
  const allowed = MIME_BY_KIND[input.kind];
  const ct = input.contentType.toLowerCase().trim();
  const ok = allowed.some((m) => (typeof m === 'string' ? m === ct : m.test(ct)));
  if (!ok) {
    throw ApiError.badRequest(
      `Unsupported content type "${input.contentType}" for kind=${input.kind}`,
    );
  }
  const limit = SIZE_LIMITS[input.kind];
  if (input.sizeBytes <= 0) {
    throw ApiError.badRequest('sizeBytes must be > 0');
  }
  if (input.sizeBytes > limit) {
    throw ApiError.badRequest(
      `File too large: ${formatBytes(input.sizeBytes)} > ${formatBytes(limit)} (limit for kind=${input.kind})`,
    );
  }
}

/**
 * Build the S3 object key with an enforced prefix per user.
 * Keys cannot be guessed by other users because they include a random nanoid.
 *
 *   uploads/<uploaderId>/<nanoid>/<sanitized-filename>
 *
 * Reusing user-id as a prefix makes it trivial to audit and to write a
 * lifecycle rule like "delete uploads/* older than N days from inactive users".
 */
import { nanoid } from 'nanoid';

export function buildObjectKey(opts: { uploaderId: string; originalName: string }): string {
  const safeName = opts.originalName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'file';
  return `uploads/${opts.uploaderId}/${nanoid(16)}/${safeName}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
