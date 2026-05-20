import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

describe('validateUpload', () => {
  it('accepts PDF for kind=file', async () => {
    const { validateUpload } = await import('@/lib/storage/validation');
    expect(() =>
      validateUpload({ kind: 'file', contentType: 'application/pdf', sizeBytes: 100_000 }),
    ).not.toThrow();
  });

  it('rejects .exe for kind=file', async () => {
    const { validateUpload } = await import('@/lib/storage/validation');
    const { ApiError } = await import('@/lib/api/errors');
    expect(() =>
      validateUpload({
        kind: 'file',
        contentType: 'application/x-msdownload',
        sizeBytes: 1000,
      }),
    ).toThrow(ApiError);
  });

  it('rejects non-image MIME for kind=image', async () => {
    const { validateUpload } = await import('@/lib/storage/validation');
    const { ApiError } = await import('@/lib/api/errors');
    expect(() =>
      validateUpload({ kind: 'image', contentType: 'application/pdf', sizeBytes: 1000 }),
    ).toThrow(ApiError);
  });

  it('enforces per-kind size cap', async () => {
    const { validateUpload } = await import('@/lib/storage/validation');
    const { ApiError } = await import('@/lib/api/errors');
    expect(() =>
      validateUpload({
        kind: 'avatar',
        contentType: 'image/png',
        sizeBytes: 5 * 1024 * 1024, // 5MB > 2MB cap
      }),
    ).toThrow(ApiError);
  });

  it('rejects zero/negative sizes', async () => {
    const { validateUpload } = await import('@/lib/storage/validation');
    const { ApiError } = await import('@/lib/api/errors');
    expect(() =>
      validateUpload({ kind: 'file', contentType: 'application/pdf', sizeBytes: 0 }),
    ).toThrow(ApiError);
  });

  it('accepts images inside the generic "file" kind via regex', async () => {
    const { validateUpload } = await import('@/lib/storage/validation');
    expect(() =>
      validateUpload({ kind: 'file', contentType: 'image/jpeg', sizeBytes: 1024 }),
    ).not.toThrow();
  });
});

describe('buildObjectKey', () => {
  it('puts files under uploads/<uploaderId>/<nanoid>/<safeName>', async () => {
    const { buildObjectKey } = await import('@/lib/storage/validation');
    const key = buildObjectKey({ uploaderId: 'usr_abc', originalName: 'Hello WORLD.pdf' });
    expect(key).toMatch(/^uploads\/usr_abc\/[A-Za-z0-9_-]{16}\/hello-world\.pdf$/);
  });

  it('strips path separators and unsafe punctuation from the filename', async () => {
    const { buildObjectKey } = await import('@/lib/storage/validation');
    const key = buildObjectKey({ uploaderId: 'u', originalName: '../../etc/passwd?evil!.txt' });
    // The S3 key has its own "/" hierarchy (uploads/<uid>/<nanoid>/<name>).
    // The final segment must NOT contain "/", "?" or "!". Dots stay (the
    // .ext is wanted) — `..` survives but is harmless because S3 keys are
    // opaque strings, not real paths.
    const filenameSegment = key.split('/').pop()!;
    expect(filenameSegment).not.toContain('/');
    expect(filenameSegment).not.toContain('?');
    expect(filenameSegment).not.toContain('!');
    expect(filenameSegment).toBe('..-..-etc-passwd-evil-.txt');
  });

  it('substitutes empty filename with "file"', async () => {
    const { buildObjectKey } = await import('@/lib/storage/validation');
    const key = buildObjectKey({ uploaderId: 'u', originalName: '???' });
    expect(key.split('/').pop()).toBe('file');
  });
});
