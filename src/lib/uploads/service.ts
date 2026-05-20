import type { PrismaClient } from '@prisma/client';

import { ApiError } from '../api/errors';
import { env } from '../env';
import {
  BUCKET,
  buildObjectKey,
  deleteObject,
  presignDownload,
  presignUpload,
  validateUpload,
  type UploadKind,
} from '../storage';
import type { SignUploadInput } from './schemas';

export interface SignedUploadResponse {
  /** PUT this with the file body. Include `Content-Type: <contentType>` header. */
  uploadUrl: string;
  /** Insert these into your follow-up POST to /api/lessons/:id/materials etc. */
  fileId: string;
  key: string;
  expiresAt: string;
}

export interface UploadsServiceDeps {
  prisma: PrismaClient;
  uploaderId: string;
}

export class UploadsService {
  constructor(private readonly deps: UploadsServiceDeps) {}

  /**
   * Two-phase upload:
   *   1) Client calls /api/uploads/sign with metadata → gets uploadUrl + fileId
   *   2) Client PUTs the file directly to the uploadUrl
   *   3) Client calls the consumer endpoint (e.g. /api/lessons/:id/materials) with fileId
   *
   * StoredFile is created up-front so the fileId is stable and the system has
   * a record even if the client never completes the PUT. A nightly cleanup
   * job (TODO) can prune orphan StoredFile rows that don't have an actual
   * S3 object after 24h. For Capa 3 we keep it simple — orphans cost nothing.
   */
  async signUpload(input: SignUploadInput): Promise<SignedUploadResponse> {
    validateUpload({
      kind: input.kind as UploadKind,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });

    const key = buildObjectKey({
      uploaderId: this.deps.uploaderId,
      originalName: input.originalName,
    });
    const expiresInSec = 600;
    const expiresAt = new Date(Date.now() + expiresInSec * 1000);
    const uploadUrl = await presignUpload({
      key,
      contentType: input.contentType,
      expiresInSec,
    });

    const file = await this.deps.prisma.storedFile.create({
      data: {
        key,
        bucket: BUCKET(),
        originalName: input.originalName,
        mimeType: input.contentType,
        sizeBytes: input.sizeBytes,
        uploaderId: this.deps.uploaderId,
      },
      select: { id: true, key: true },
    });

    return {
      uploadUrl,
      fileId: file.id,
      key: file.key,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Resolve a fileId to a short-lived signed download URL.
   * The route that calls this is responsible for permission checks
   * (e.g. "is the caller enrolled in the course this material belongs to?").
   */
  async getDownloadUrl(fileId: string): Promise<{ url: string; originalName: string; mimeType: string; sizeBytes: number; }> {
    const file = await this.deps.prisma.storedFile.findUnique({
      where: { id: fileId },
      select: { key: true, originalName: true, mimeType: true, sizeBytes: true },
    });
    if (!file) throw ApiError.notFound('File not found');
    const url = env.S3_PUBLIC_URL
      ? `${env.S3_PUBLIC_URL.replace(/\/+$/, '')}/${file.key}`
      : await presignDownload({ key: file.key, downloadFilename: file.originalName });
    return { url, originalName: file.originalName, mimeType: file.mimeType, sizeBytes: file.sizeBytes };
  }

  /** Best-effort delete of the S3 object + DB row. Safe to call multiple times. */
  async deleteFile(fileId: string): Promise<void> {
    const file = await this.deps.prisma.storedFile.findUnique({
      where: { id: fileId },
      select: { key: true },
    });
    if (!file) return;
    try {
      await deleteObject(file.key);
    } catch (err) {
      // If S3 delete fails we still drop the DB row — the orphan object will
      // be picked up by the bucket lifecycle policy (configured by the user).
      // eslint-disable-next-line no-console
      console.warn(`Failed to delete S3 object ${file.key}:`, err);
    }
    await this.deps.prisma.storedFile.delete({ where: { id: fileId } }).catch(() => undefined);
  }
}
