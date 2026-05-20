import { describe, expect, it, beforeAll, vi } from 'vitest';
import { AccountStatus, Role } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

// Helper: build a Prisma mock that returns the given teacher.
function makePrismaMock(teacher: {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: AccountStatus;
  avatarUrl: string | null;
  phone: string | null;
  deletedAt: Date | null;
  createdAt: Date;
} | null) {
  const userUpdate = vi.fn();
  const refreshTokenUpdateMany = vi.fn();
  const auditLogCreate = vi.fn();
  return {
    mock: {
      user: { findUnique: vi.fn().mockResolvedValue(teacher), update: userUpdate },
      auditLog: { create: auditLogCreate },
      refreshToken: { updateMany: refreshTokenUpdateMany },
      // The service calls $transaction with an array of pre-built promises in some places
      // and with a callback in others. Cover both.
      $transaction: vi.fn(async (ops: unknown) => {
        if (typeof ops === 'function') {
          return (ops as (tx: unknown) => unknown)({
            user: { update: userUpdate },
            refreshToken: { updateMany: refreshTokenUpdateMany, create: vi.fn() },
            refreshTokenCreate: vi.fn(),
            auditLog: { create: auditLogCreate },
          });
        }
        return Promise.all(ops as Array<Promise<unknown>>);
      }),
    } as unknown as Parameters<typeof import('@/lib/users/service').UsersService>[0],
    userUpdate,
    refreshTokenUpdateMany,
    auditLogCreate,
  };
}

const baseTeacher = {
  id: 'tch_1',
  email: 'teach@example.com',
  fullName: 'Teach',
  role: Role.TEACHER,
  status: AccountStatus.PENDING_APPROVAL,
  avatarUrl: null,
  phone: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('UsersService.approveTeacher', () => {
  it('approves a PENDING teacher, sets ACTIVE, and writes audit log', async () => {
    const { mock, userUpdate, auditLogCreate } = makePrismaMock(baseTeacher);
    userUpdate.mockResolvedValue({ ...baseTeacher, status: AccountStatus.ACTIVE });
    const { UsersService } = await import('@/lib/users/service');
    const svc = new UsersService(mock);

    const result = await svc.approveTeacher('tch_1', 'adm_1', 'looks legit');

    expect(result.status).toBe(AccountStatus.ACTIVE);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'tch_1' },
      data: { status: AccountStatus.ACTIVE },
    });
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'adm_1',
          action: 'APPROVE',
          entity: 'User',
          entityId: 'tch_1',
        }),
      }),
    );
  });

  it('is idempotent when teacher is already ACTIVE', async () => {
    const active = { ...baseTeacher, status: AccountStatus.ACTIVE };
    const { mock } = makePrismaMock(active);
    const { UsersService } = await import('@/lib/users/service');
    const svc = new UsersService(mock);
    const result = await svc.approveTeacher('tch_1', 'adm_1');
    expect(result.status).toBe(AccountStatus.ACTIVE);
  });

  it('throws BadRequest when target is not a teacher', async () => {
    const student = { ...baseTeacher, role: Role.STUDENT };
    const { mock } = makePrismaMock(student);
    const { UsersService } = await import('@/lib/users/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new UsersService(mock);
    await expect(svc.approveTeacher('tch_1', 'adm_1')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws NotFound for unknown id', async () => {
    const { mock } = makePrismaMock(null);
    const { UsersService } = await import('@/lib/users/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new UsersService(mock);
    await expect(svc.approveTeacher('missing', 'adm_1')).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses to approve REJECTED or SUSPENDED teachers', async () => {
    const { UsersService } = await import('@/lib/users/service');
    const { ApiError } = await import('@/lib/api/errors');
    for (const status of [AccountStatus.REJECTED, AccountStatus.SUSPENDED]) {
      const { mock } = makePrismaMock({ ...baseTeacher, status });
      const svc = new UsersService(mock);
      await expect(svc.approveTeacher('tch_1', 'adm_1')).rejects.toBeInstanceOf(ApiError);
    }
  });
});
