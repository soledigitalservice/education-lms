import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

function buildMock() {
  return {
    course: { findFirst: vi.fn() },
    lesson: { findUnique: vi.fn() },
    enrollment: { findFirst: vi.fn() },
    storedFile: { findUnique: vi.fn(), delete: vi.fn() },
    material: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)({});
      return ops;
    }),
  };
}

const ownerCourse = { id: 'crs_1', teacherId: 'tch_1', deletedAt: null };

describe('MaterialsService.createForLesson', () => {
  it('attaches a LINK material with just a URL', async () => {
    const m = buildMock();
    m.lesson.findUnique.mockResolvedValue({
      id: 'l1',
      module: { course: ownerCourse },
    });
    m.material.create.mockResolvedValue({
      id: 'mat_1',
      title: 'Wikipedia',
      type: 'LINK',
      url: 'https://en.wikipedia.org',
      fileId: null,
      mimeType: null,
      sizeBytes: null,
      createdAt: new Date(),
    });

    const { MaterialsService } = await import('@/lib/materials/service');
    const svc = new MaterialsService(m as never);
    const result = await svc.createForLesson(
      'l1',
      { source: 'link', title: 'Wikipedia', url: 'https://en.wikipedia.org', type: 'LINK' },
      { userId: 'tch_1', role: Role.TEACHER },
    );

    expect(m.material.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          url: 'https://en.wikipedia.org',
          fileId: null,
          lessonId: 'l1',
        }),
      }),
    );
    expect(result.type).toBe('LINK');
  });

  it('forbids attaching another user\'s file', async () => {
    const m = buildMock();
    m.lesson.findUnique.mockResolvedValue({
      id: 'l1',
      module: { course: ownerCourse },
    });
    m.storedFile.findUnique.mockResolvedValue({
      id: 'f1',
      key: 'uploads/u/abc/file.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      uploaderId: 'other_user',
    });

    const { MaterialsService } = await import('@/lib/materials/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new MaterialsService(m as never);
    await expect(
      svc.createForLesson(
        'l1',
        { source: 'upload', title: 'X', fileId: 'f1', type: 'PDF' },
        { userId: 'tch_1', role: Role.TEACHER },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects when caller is not the course owner', async () => {
    const m = buildMock();
    m.lesson.findUnique.mockResolvedValue({
      id: 'l1',
      module: { course: ownerCourse },
    });

    const { MaterialsService } = await import('@/lib/materials/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new MaterialsService(m as never);
    await expect(
      svc.createForLesson(
        'l1',
        { source: 'link', title: 'X', url: 'https://x.com', type: 'LINK' },
        { userId: 'other_teacher', role: Role.TEACHER },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects when fileId does not exist', async () => {
    const m = buildMock();
    m.lesson.findUnique.mockResolvedValue({
      id: 'l1',
      module: { course: ownerCourse },
    });
    m.storedFile.findUnique.mockResolvedValue(null);

    const { MaterialsService } = await import('@/lib/materials/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new MaterialsService(m as never);
    await expect(
      svc.createForLesson(
        'l1',
        { source: 'upload', title: 'X', fileId: 'missing', type: 'PDF' },
        { userId: 'tch_1', role: Role.TEACHER },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('MaterialsService.listForLesson (visibility)', () => {
  it('rejects a non-enrolled student', async () => {
    const m = buildMock();
    m.lesson.findUnique.mockResolvedValue({
      id: 'l1',
      module: { course: ownerCourse },
    });
    m.enrollment.findFirst.mockResolvedValue(null);

    const { MaterialsService } = await import('@/lib/materials/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new MaterialsService(m as never);
    await expect(
      svc.listForLesson('l1', { userId: 'stu_1', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('allows an enrolled student', async () => {
    const m = buildMock();
    m.lesson.findUnique.mockResolvedValue({
      id: 'l1',
      module: { course: ownerCourse },
    });
    m.enrollment.findFirst.mockResolvedValue({ id: 'enr_1' });
    m.material.findMany.mockResolvedValue([]);

    const { MaterialsService } = await import('@/lib/materials/service');
    const svc = new MaterialsService(m as never);
    const result = await svc.listForLesson('l1', { userId: 'stu_1', role: Role.STUDENT });
    expect(result).toEqual([]);
  });
});
