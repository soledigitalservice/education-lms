import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ChatRoomKind, Role } from '@prisma/client';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

function buildMock() {
  return {
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    chatRoom: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    chatParticipant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    message: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    storedFile: { findUnique: vi.fn() },
    enrollment: { findMany: vi.fn() },
    parentChildLink: { findMany: vi.fn() },
    course: { findUnique: vi.fn() },
  };
}

describe('ChatService.createDirect', () => {
  it('rejects chatting with yourself', async () => {
    const m = buildMock();
    const { ChatService } = await import('@/lib/chat/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ChatService(m as never);
    await expect(
      svc.createDirect('u1', { userId: 'u1', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('returns existing room when one already exists (idempotent)', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue({ id: 'u2', deletedAt: null, role: Role.STUDENT });
    m.chatRoom.findFirst.mockResolvedValue({ id: 'room_1' });
    m.chatRoom.findUniqueOrThrow.mockResolvedValue({
      id: 'room_1',
      kind: ChatRoomKind.DIRECT,
      name: null,
      courseId: null,
      updatedAt: new Date(),
      participants: [
        { userId: 'u1', user: { id: 'u1', fullName: 'A', avatarUrl: null }, lastReadMessageId: null },
        { userId: 'u2', user: { id: 'u2', fullName: 'B', avatarUrl: null }, lastReadMessageId: null },
      ],
      _count: { participants: 2 },
    });
    m.message.findFirst.mockResolvedValue(null);
    m.message.count.mockResolvedValue(0);

    const { ChatService } = await import('@/lib/chat/service');
    const svc = new ChatService(m as never);
    const room = await svc.createDirect('u2', { userId: 'u1', role: Role.STUDENT });
    expect(room.id).toBe('room_1');
    expect(m.chatRoom.create).not.toHaveBeenCalled();
  });

  it('creates a DIRECT room with two participants when none exists', async () => {
    const m = buildMock();
    m.user.findUnique.mockResolvedValue({ id: 'u2', deletedAt: null, role: Role.TEACHER });
    m.chatRoom.findFirst.mockResolvedValue(null);
    m.chatRoom.create.mockResolvedValue({ id: 'room_new' });
    m.chatRoom.findUniqueOrThrow.mockResolvedValue({
      id: 'room_new',
      kind: ChatRoomKind.DIRECT,
      name: null,
      courseId: null,
      updatedAt: new Date(),
      participants: [
        { userId: 'u1', user: { id: 'u1', fullName: 'A', avatarUrl: null }, lastReadMessageId: null },
        { userId: 'u2', user: { id: 'u2', fullName: 'B', avatarUrl: null }, lastReadMessageId: null },
      ],
      _count: { participants: 2 },
    });
    m.message.findFirst.mockResolvedValue(null);
    m.message.count.mockResolvedValue(0);

    const { ChatService } = await import('@/lib/chat/service');
    const svc = new ChatService(m as never);
    const room = await svc.createDirect('u2', { userId: 'u1', role: Role.STUDENT });
    expect(room.id).toBe('room_new');
    expect(m.chatRoom.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: ChatRoomKind.DIRECT,
          participants: { create: [{ userId: 'u1' }, { userId: 'u2' }] },
        }),
      }),
    );
  });
});

describe('ChatService.sendMessage', () => {
  it('rejects non-members', async () => {
    const m = buildMock();
    m.chatParticipant.findUnique.mockResolvedValue(null);
    const { ChatService } = await import('@/lib/chat/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ChatService(m as never);
    await expect(
      svc.sendMessage('room_1', { body: 'hi' }, { userId: 'u1', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects attaching another user’s file', async () => {
    const m = buildMock();
    m.chatParticipant.findUnique.mockResolvedValue({ id: 'p' });
    m.storedFile.findUnique.mockResolvedValue({ uploaderId: 'other' });
    const { ChatService } = await import('@/lib/chat/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ChatService(m as never);
    await expect(
      svc.sendMessage(
        'room_1',
        { body: 'see', fileId: 'f1' },
        { userId: 'u1', role: Role.STUDENT },
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('persists the message and bumps room updatedAt', async () => {
    const m = buildMock();
    m.chatParticipant.findUnique.mockResolvedValue({ id: 'p' });
    m.message.create.mockResolvedValue({
      id: 'msg_1',
      roomId: 'room_1',
      senderId: 'u1',
      sender: { fullName: 'A' },
      body: 'hello',
      fileId: null,
      file: null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date(),
    });

    const { ChatService } = await import('@/lib/chat/service');
    const svc = new ChatService(m as never);
    const out = await svc.sendMessage(
      'room_1',
      { body: 'hello' },
      { userId: 'u1', role: Role.STUDENT },
    );
    expect(out.body).toBe('hello');
    expect(m.chatRoom.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'room_1' } }),
    );
  });
});

describe('ChatService.markRead', () => {
  it('rejects messageId that does not belong to the room', async () => {
    const m = buildMock();
    m.chatParticipant.findUnique.mockResolvedValue({ id: 'p' });
    m.message.findUnique.mockResolvedValue({ roomId: 'room_OTHER' });
    const { ChatService } = await import('@/lib/chat/service');
    const { ApiError } = await import('@/lib/api/errors');
    const svc = new ChatService(m as never);
    await expect(
      svc.markRead('room_1', 'msg_x', { userId: 'u1', role: Role.STUDENT }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('updates the participant cursor', async () => {
    const m = buildMock();
    m.chatParticipant.findUnique.mockResolvedValue({ id: 'p' });
    m.message.findUnique.mockResolvedValue({ roomId: 'room_1' });
    const { ChatService } = await import('@/lib/chat/service');
    const svc = new ChatService(m as never);
    await svc.markRead('room_1', 'msg_1', { userId: 'u1', role: Role.STUDENT });
    expect(m.chatParticipant.update).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: 'room_1', userId: 'u1' } },
      data: { lastReadMessageId: 'msg_1' },
    });
  });
});

describe('ChatService.unreadCountForUser', () => {
  it('returns 0 when user has no memberships', async () => {
    const m = buildMock();
    m.chatParticipant.findMany.mockResolvedValue([]);
    const { ChatService } = await import('@/lib/chat/service');
    const svc = new ChatService(m as never);
    expect(await svc.unreadCountForUser('u1')).toBe(0);
  });

  it('counts messages after the cursor, not from self', async () => {
    const m = buildMock();
    m.chatParticipant.findMany.mockResolvedValue([
      { roomId: 'r1', lastReadMessageId: 'm_last' },
    ]);
    m.message.findUnique.mockResolvedValue({ createdAt: new Date('2026-01-01') });
    m.message.count.mockResolvedValue(7);

    const { ChatService } = await import('@/lib/chat/service');
    const svc = new ChatService(m as never);
    expect(await svc.unreadCountForUser('u1')).toBe(7);
    expect(m.message.count).toHaveBeenCalledWith({
      where: {
        roomId: 'r1',
        deletedAt: null,
        createdAt: { gt: new Date('2026-01-01') },
        NOT: { senderId: 'u1' },
      },
    });
  });
});
