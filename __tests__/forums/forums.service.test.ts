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
    user: { findUnique: vi.fn() },
    course: { findFirst: vi.fn(), findUnique: vi.fn() },
    enrollment: { findFirst: vi.fn() },
    forum: { findUnique: vi.fn(), create: vi.fn() },
    forumThread: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    forumPost: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    notification: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(async (op: unknown) => {
      if (Array.isArray(op)) return Promise.all(op);
      if (typeof op === 'function') return (op as (tx: unknown) => unknown)({});
      return op;
    }),
  };
}

const ownerCourse = { id: 'crs', slug: 'algebra', title: 'Algebra', teacherId: 'tch', deletedAt: null };

describe('ForumsService.getForCourse', () => {
  it('auto-creates the Forum row on first access', async () => {
    const m = buildMock();
    m.course.findFirst.mockResolvedValue(ownerCourse);
    m.forum.findUnique.mockResolvedValue(null);
    m.forum.create.mockResolvedValue({ id: 'forum_new' });
    const { ForumsService } = await import('@/lib/forums/service');
    const svc = new ForumsService(m as never);
    const out = await svc.getForCourse('crs', { userId: 'tch', role: Role.TEACHER });
    expect(out.id).toBe('forum_new');
    expect(m.forum.create).toHaveBeenCalled();
  });

  it('rejects non-enrolled non-owner student', async () => {
    const m = buildMock();
    m.course.findFirst.mockResolvedValue(ownerCourse);
    m.enrollment.findFirst.mockResolvedValue(null);
    const { ForumsService } = await import('@/lib/forums/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ForumsService(m as never);
    await expect(
      svc.getForCourse('crs', { userId: 'stu', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('allows enrolled student', async () => {
    const m = buildMock();
    m.course.findFirst.mockResolvedValue(ownerCourse);
    m.enrollment.findFirst.mockResolvedValue({ id: 'enr' });
    m.forum.findUnique.mockResolvedValue({ id: 'forum_1' });
    const { ForumsService } = await import('@/lib/forums/service');
    const svc = new ForumsService(m as never);
    const out = await svc.getForCourse('crs', { userId: 'stu', role: Role.STUDENT });
    expect(out.id).toBe('forum_1');
  });
});

describe('ForumsService.createPost', () => {
  it('rejects when the thread is locked', async () => {
    const m = buildMock();
    m.forumThread.findUnique.mockResolvedValue({
      id: 't1',
      authorId: 'auth',
      forumId: 'f1',
      title: 'X',
      locked: true,
      forum: {
        id: 'f1',
        courseId: 'crs',
        course: { id: 'crs', teacherId: 'tch', deletedAt: null },
      },
    });
    const { ForumsService } = await import('@/lib/forums/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ForumsService(m as never);
    await expect(
      svc.createPost('t1', { body: 'hi' }, { userId: 'stu', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('flattens replies-of-replies to a single level', async () => {
    const m = buildMock();
    m.forumThread.findUnique.mockResolvedValue({
      id: 't1',
      authorId: 'auth',
      forumId: 'f1',
      title: 'X',
      locked: false,
      forum: {
        id: 'f1',
        courseId: 'crs',
        course: { id: 'crs', teacherId: 'tch', deletedAt: null },
      },
    });
    m.enrollment.findFirst.mockResolvedValue({ id: 'enr' });
    // The "parent" the caller pointed at is itself a reply (it has a parentId).
    m.forumPost.findUnique.mockResolvedValue({
      id: 'p_child',
      threadId: 't1',
      parentId: 'p_root',
      authorId: 'someone',
    });
    m.forumPost.create.mockResolvedValue({
      id: 'p_new',
      threadId: 't1',
      parentId: 'p_root',
      body: 'hi',
      author: { id: 'stu', fullName: 'S' },
      editedAt: null,
      createdAt: new Date(),
    });
    m.course.findUnique.mockResolvedValue({ slug: 'algebra' });
    const { ForumsService } = await import('@/lib/forums/service');
    const svc = new ForumsService(m as never);
    await svc.createPost(
      't1',
      { body: 'hi', parentId: 'p_child' },
      { userId: 'stu', role: Role.STUDENT },
    );
    // Should have flattened parentId to p_root (the original root post).
    const createArg = m.forumPost.create.mock.calls[0]![0];
    expect(createArg.data.parentId).toBe('p_root');
  });
});

describe('ForumsService.updatePost', () => {
  it('non-author non-admin cannot edit', async () => {
    const m = buildMock();
    m.forumPost.findUnique.mockResolvedValue({
      id: 'p1',
      threadId: 't1',
      authorId: 'someone_else',
      deletedAt: null,
      thread: { id: 't1', forum: { course: { teacherId: 'tch', deletedAt: null } } },
    });
    const { ForumsService } = await import('@/lib/forums/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ForumsService(m as never);
    await expect(
      svc.updatePost('p1', { body: 'pwn' }, { userId: 'stu', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('ForumsService.deletePost', () => {
  it('teacher-owner can delete (moderation)', async () => {
    const m = buildMock();
    m.forumPost.findUnique.mockResolvedValue({
      id: 'p1',
      threadId: 't1',
      authorId: 'student_author',
      deletedAt: null,
      thread: { id: 't1', forum: { course: { teacherId: 'tch', deletedAt: null } } },
    });
    m.forumPost.update.mockResolvedValue({ id: 'p1' });
    const { ForumsService } = await import('@/lib/forums/service');
    const svc = new ForumsService(m as never);
    await svc.deletePost('p1', { userId: 'tch', role: Role.TEACHER });
    expect(m.forumPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date), body: '' }),
      }),
    );
  });

  it('random student cannot delete someone else’s post', async () => {
    const m = buildMock();
    m.forumPost.findUnique.mockResolvedValue({
      id: 'p1',
      threadId: 't1',
      authorId: 'someone_else',
      deletedAt: null,
      thread: { id: 't1', forum: { course: { teacherId: 'tch', deletedAt: null } } },
    });
    const { ForumsService } = await import('@/lib/forums/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ForumsService(m as never);
    await expect(
      svc.deletePost('p1', { userId: 'stu', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
