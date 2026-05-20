import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ParentLinkStatus, Role } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

function buildMock() {
  return {
    user: { findUnique: vi.fn() },
    parentChildLink: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
}

const childRow = {
  id: 'stu_1',
  email: 'child@x.com',
  role: Role.STUDENT,
  deletedAt: null,
};

const linkBase = {
  id: 'lnk_1',
  parentId: 'par_1',
  childId: 'stu_1',
  status: ParentLinkStatus.PENDING,
  requestedAt: new Date(),
  decidedAt: null,
  decidedById: null,
  notes: null,
  inviteTokenHash: 'hash',
  inviteExpiresAt: new Date(Date.now() + 86_400_000),
  parent: { id: 'par_1', fullName: 'Par', email: 'par@x.com' },
  child: { id: 'stu_1', fullName: 'Stu', email: 'child@x.com', avatarUrl: null },
};

describe('ParentLinksService.request', () => {
  it('only parents (or admins) can request', async () => {
    const m = buildMock();
    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ParentLinksService(m as never);
    await expect(
      svc.request({ childEmail: 'x@y.com' }, { userId: 'u', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects when target email is not a STUDENT', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue({ ...childRow, role: Role.TEACHER });
    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ParentLinksService(m as never);
    await expect(
      svc.request({ childEmail: 'child@x.com' }, { userId: 'par_1', role: Role.PARENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects self-link', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue({ ...childRow, id: 'par_1' });
    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ParentLinksService(m as never);
    await expect(
      svc.request({ childEmail: 'child@x.com' }, { userId: 'par_1', role: Role.PARENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('creates a PENDING link with invite token + hash', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue(childRow);
    m.parentChildLink.findUnique.mockResolvedValue(null);
    m.parentChildLink.create.mockResolvedValue({ id: 'lnk_1' });
    m.parentChildLink.findUniqueOrThrow.mockResolvedValue(linkBase);

    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const svc = new ParentLinksService(m as never);
    const result = await svc.request(
      { childEmail: 'child@x.com' },
      { userId: 'par_1', role: Role.PARENT },
    );
    expect(result.link.status).toBe(ParentLinkStatus.PENDING);
    expect(result.inviteToken).toMatch(/.{20,}/); // base64url-ish
    expect(m.parentChildLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentId: 'par_1',
          childId: 'stu_1',
          status: ParentLinkStatus.PENDING,
        }),
      }),
    );
  });

  it('is idempotent for PENDING (returns same link, no second create)', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue(childRow);
    m.parentChildLink.findUnique.mockResolvedValue({
      id: 'lnk_1',
      status: ParentLinkStatus.PENDING,
      parentId: 'par_1',
      childId: 'stu_1',
    });
    m.parentChildLink.findUniqueOrThrow.mockResolvedValue(linkBase);

    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const svc = new ParentLinksService(m as never);
    const result = await svc.request(
      { childEmail: 'child@x.com' },
      { userId: 'par_1', role: Role.PARENT },
    );
    expect(result.link.status).toBe(ParentLinkStatus.PENDING);
    expect(m.parentChildLink.create).not.toHaveBeenCalled();
  });

  it('revives a previously REJECTED/REVOKED link as PENDING', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue(childRow);
    m.parentChildLink.findUnique.mockResolvedValue({
      id: 'lnk_1',
      status: ParentLinkStatus.REJECTED,
      parentId: 'par_1',
      childId: 'stu_1',
    });
    m.parentChildLink.update.mockResolvedValue({ id: 'lnk_1' });
    m.parentChildLink.findUniqueOrThrow.mockResolvedValue(linkBase);

    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const svc = new ParentLinksService(m as never);
    const result = await svc.request(
      { childEmail: 'child@x.com' },
      { userId: 'par_1', role: Role.PARENT },
    );
    expect(m.parentChildLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lnk_1' },
        data: expect.objectContaining({ status: ParentLinkStatus.PENDING }),
      }),
    );
    expect(result.inviteToken).not.toBe('');
  });
});

describe('ParentLinksService.approve', () => {
  it('only the child can approve their own invitation', async () => {
    const m = buildMock();
    m.parentChildLink.findUnique.mockResolvedValue(linkBase);
    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ParentLinksService(m as never);
    await expect(
      svc.approve('lnk_1', {}, { userId: 'someone_else', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects when invitation expired', async () => {
    const m = buildMock();
    m.parentChildLink.findUnique.mockResolvedValue({
      ...linkBase,
      inviteExpiresAt: new Date(Date.now() - 1000),
    });
    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ParentLinksService(m as never);
    await expect(
      svc.approve('lnk_1', {}, { userId: 'stu_1', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('happy path: marks APPROVED and clears the token', async () => {
    const m = buildMock();
    m.parentChildLink.findUnique.mockResolvedValue(linkBase);
    m.parentChildLink.update.mockResolvedValue({
      ...linkBase,
      status: ParentLinkStatus.APPROVED,
      decidedAt: new Date(),
      inviteTokenHash: null,
      inviteExpiresAt: null,
    });

    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const svc = new ParentLinksService(m as never);
    const result = await svc.approve('lnk_1', {}, { userId: 'stu_1', role: Role.STUDENT });
    expect(result.status).toBe(ParentLinkStatus.APPROVED);
    expect(m.parentChildLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ParentLinkStatus.APPROVED,
          inviteTokenHash: null,
          inviteExpiresAt: null,
        }),
      }),
    );
  });
});

describe('ParentLinksService.assertParentOf', () => {
  it('allows ADMIN unconditionally', async () => {
    const m = buildMock();
    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const svc = new ParentLinksService(m as never);
    await expect(
      svc.assertParentOf('any', { userId: 'adm', role: Role.ADMIN }),
    ).resolves.toBeUndefined();
    expect(m.parentChildLink.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when status is not APPROVED', async () => {
    const m = buildMock();
    m.parentChildLink.findUnique.mockResolvedValue({ status: ParentLinkStatus.PENDING });
    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ParentLinksService(m as never);
    await expect(
      svc.assertParentOf('stu', { userId: 'par', role: Role.PARENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects non-PARENT roles', async () => {
    const m = buildMock();
    const { ParentLinksService } = await import('@/lib/parent-links/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ParentLinksService(m as never);
    await expect(
      svc.assertParentOf('stu', { userId: 'tch', role: Role.TEACHER }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('GradesService.listForStudent — parent access', () => {
  it('allows parent with APPROVED link to read child grades', async () => {
    const m = {
      parentChildLink: { findUnique: vi.fn().mockResolvedValue({ status: 'APPROVED' }) },
      grade: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const { GradesService } = await import('@/lib/grades/service');
    const svc = new GradesService(m as never);
    await expect(
      svc.listForStudent('stu_1', { userId: 'par_1', role: Role.PARENT }),
    ).resolves.toEqual([]);
    expect(m.grade.findMany).toHaveBeenCalled();
  });

  it('rejects parent without APPROVED link', async () => {
    const m = {
      parentChildLink: { findUnique: vi.fn().mockResolvedValue({ status: 'PENDING' }) },
      grade: { findMany: vi.fn() },
    };
    const { GradesService } = await import('@/lib/grades/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new GradesService(m as never);
    await expect(
      svc.listForStudent('stu_1', { userId: 'par_1', role: Role.PARENT }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(m.grade.findMany).not.toHaveBeenCalled();
  });
});
