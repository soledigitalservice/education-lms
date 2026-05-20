import {
  ChatRoomKind,
  EnrollmentStatus,
  Prisma,
  Role,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import type {
  CreateGroupInput,
  ListMessagesQuery,
  SendMessageInput,
} from './schemas';

export interface ChatRoomDto {
  id: string;
  kind: ChatRoomKind;
  name: string | null;
  courseId: string | null;
  /// For DIRECT, the OTHER participant (not the caller). For GROUP/COURSE, null.
  otherParticipant: { id: string; fullName: string; avatarUrl: string | null } | null;
  /// Light count of unread messages for the calling user.
  unreadCount: number;
  /// Most-recent message preview (or null when the room is empty).
  lastMessage: { id: string; body: string; senderId: string; createdAt: string } | null;
  participantCount: number;
  updatedAt: string;
}

export interface ChatMessageDto {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
  fileId: string | null;
  fileName: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export class ChatService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- room creation ---------------------------------------------------

  /**
   * Find-or-create a DIRECT room between caller and `otherUserId`.
   * Idempotent — calling twice returns the same room id.
   */
  async createDirect(otherUserId: string, ctx: CourseAuthCtx): Promise<ChatRoomDto> {
    if (otherUserId === ctx.userId) {
      throw ApiError.badRequest('Cannot start a direct chat with yourself');
    }
    const other = await this.prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, deletedAt: true, role: true },
    });
    if (!other || other.deletedAt) throw ApiError.notFound('User not found');

    // Look up an existing DIRECT room where BOTH ids appear.
    const existing = await this.prisma.chatRoom.findFirst({
      where: {
        kind: ChatRoomKind.DIRECT,
        AND: [
          { participants: { some: { userId: ctx.userId } } },
          { participants: { some: { userId: otherUserId } } },
        ],
      },
    });
    if (existing) return this.toRoomDto(existing.id, ctx.userId);

    const created = await this.prisma.chatRoom.create({
      data: {
        kind: ChatRoomKind.DIRECT,
        participants: {
          create: [{ userId: ctx.userId }, { userId: otherUserId }],
        },
      },
    });
    return this.toRoomDto(created.id, ctx.userId);
  }

  /** Create an ad-hoc GROUP chat. Caller is auto-added. */
  async createGroup(input: CreateGroupInput, ctx: CourseAuthCtx): Promise<ChatRoomDto> {
    const memberIds = Array.from(new Set([ctx.userId, ...input.memberIds]));
    // Validate all exist + active.
    const found = await this.prisma.user.count({
      where: { id: { in: memberIds }, deletedAt: null },
    });
    if (found !== memberIds.length) {
      throw ApiError.badRequest('One or more members do not exist');
    }

    const created = await this.prisma.chatRoom.create({
      data: {
        kind: ChatRoomKind.GROUP,
        name: input.name.trim(),
        participants: { create: memberIds.map((userId) => ({ userId })) },
      },
    });
    return this.toRoomDto(created.id, ctx.userId);
  }

  /**
   * Ensure a COURSE room exists and the given user is in it. Idempotent.
   * Called from EnrollmentsService.approve and from a "join course chat"
   * action when the teacher visits the course page.
   */
  async ensureCourseRoomMembership(courseId: string, userId: string): Promise<void> {
    let room = await this.prisma.chatRoom.findUnique({ where: { courseId } });
    if (!room) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, title: true, deletedAt: true },
      });
      if (!course || course.deletedAt) throw ApiError.notFound('Course not found');
      room = await this.prisma.chatRoom.create({
        data: { kind: ChatRoomKind.COURSE, name: course.title, courseId },
      });
    }
    await this.prisma.chatParticipant.upsert({
      where: { roomId_userId: { roomId: room.id, userId } },
      update: {},
      create: { roomId: room.id, userId },
    });
  }

  // ---- read ------------------------------------------------------------

  async listMyRooms(ctx: CourseAuthCtx): Promise<ChatRoomDto[]> {
    const memberships = await this.prisma.chatParticipant.findMany({
      where: { userId: ctx.userId },
      include: {
        room: { include: { _count: { select: { participants: true } } } },
      },
      orderBy: { room: { updatedAt: 'desc' } },
    });
    const out: ChatRoomDto[] = [];
    for (const m of memberships) {
      out.push(await this.toRoomDto(m.roomId, ctx.userId));
    }
    return out.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
  }

  async getRoom(roomId: string, ctx: CourseAuthCtx): Promise<ChatRoomDto> {
    await this.assertMember(roomId, ctx);
    return this.toRoomDto(roomId, ctx.userId);
  }

  async listMessages(
    roomId: string,
    query: ListMessagesQuery,
    ctx: CourseAuthCtx,
  ): Promise<ChatMessageDto[]> {
    await this.assertMember(roomId, ctx);
    let cursorCreatedAt: Date | undefined;
    if (query.cursor) {
      const c = await this.prisma.message.findUnique({
        where: { id: query.cursor },
        select: { createdAt: true },
      });
      cursorCreatedAt = c?.createdAt ?? undefined;
    }
    const rows = await this.prisma.message.findMany({
      where: {
        roomId,
        deletedAt: null,
        ...(cursorCreatedAt ? { createdAt: { lt: cursorCreatedAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: {
        sender: { select: { id: true, fullName: true } },
        file: { select: { originalName: true } },
      },
    });
    return rows.map((r) => this.toMessageDto(r));
  }

  // ---- write -----------------------------------------------------------

  async sendMessage(
    roomId: string,
    input: SendMessageInput,
    ctx: CourseAuthCtx,
  ): Promise<ChatMessageDto> {
    await this.assertMember(roomId, ctx);
    if (input.fileId) {
      const file = await this.prisma.storedFile.findUnique({
        where: { id: input.fileId },
        select: { uploaderId: true },
      });
      if (!file) throw ApiError.badRequest('Attached file not found');
      if (file.uploaderId !== ctx.userId && ctx.role !== Role.ADMIN) {
        throw ApiError.forbidden('You did not upload that file');
      }
    }
    const created = await this.prisma.message.create({
      data: {
        roomId,
        senderId: ctx.userId,
        body: input.body.trim(),
        fileId: input.fileId ?? null,
      },
      include: {
        sender: { select: { id: true, fullName: true } },
        file: { select: { originalName: true } },
      },
    });
    // Bump room updatedAt so the room sorts to the top.
    await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    // Notify other participants (best-effort, fire-and-forget). We skip email
    // for chat to avoid an inbox flood: the inapp + push channels are
    // sufficient. Dedup by roomId so a burst of messages collapses into the
    // single "CHAT_MESSAGE in this room" pending row instead of N rows.
    void this.notifyOtherParticipants(roomId, created, ctx.userId);

    return this.toMessageDto(created);
  }

  private async notifyOtherParticipants(
    roomId: string,
    message: { id: string; body: string; sender: { fullName: string } },
    senderId: string,
  ): Promise<void> {
    try {
      const { NotificationsService } = await import('../notifications/service');
      const { NotificationKind } = await import('@prisma/client');
      const room = await this.prisma.chatRoom.findUnique({
        where: { id: roomId },
        select: {
          name: true,
          kind: true,
          course: { select: { title: true } },
          participants: { where: { userId: { not: senderId } }, select: { userId: true } },
        },
      });
      if (!room) return;
      const label =
        room.kind === 'DIRECT'
          ? message.sender.fullName
          : room.course?.title ?? room.name ?? 'Chat';
      const svc = new NotificationsService(this.prisma);
      const preview = message.body.length > 80 ? message.body.slice(0, 77) + '…' : message.body;
      for (const p of room.participants) {
        await svc.dispatch({
          userId: p.userId,
          kind: NotificationKind.CHAT_MESSAGE,
          title: label,
          body: `${message.sender.fullName}: ${preview}`,
          link: `/messages?room=${roomId}`,
          channels: ['inapp', 'push'], // no email — chat would spam inboxes
          dedupKey: `chat_room:${roomId}`, // one pending notification per room until read
        });
      }
    } catch {
      // best-effort; never propagates
    }
  }

  async markRead(roomId: string, messageId: string, ctx: CourseAuthCtx): Promise<void> {
    await this.assertMember(roomId, ctx);
    // Validate the message belongs to this room (cheap safety check).
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { roomId: true },
    });
    if (!msg || msg.roomId !== roomId) {
      throw ApiError.badRequest('messageId does not belong to this room');
    }
    await this.prisma.chatParticipant.update({
      where: { roomId_userId: { roomId, userId: ctx.userId } },
      data: { lastReadMessageId: messageId },
    });
  }

  async unreadCountForUser(userId: string): Promise<number> {
    const memberships = await this.prisma.chatParticipant.findMany({
      where: { userId },
      select: { roomId: true, lastReadMessageId: true },
    });
    if (memberships.length === 0) return 0;
    let total = 0;
    for (const m of memberships) {
      total += await this.unreadForMembership(m.roomId, m.lastReadMessageId, userId);
    }
    return total;
  }

  // ---- helpers ---------------------------------------------------------

  private async assertMember(roomId: string, ctx: CourseAuthCtx): Promise<void> {
    if (ctx.role === Role.ADMIN) return;
    const member = await this.prisma.chatParticipant.findUnique({
      where: { roomId_userId: { roomId, userId: ctx.userId } },
      select: { id: true },
    });
    if (!member) throw ApiError.forbidden('You are not a member of this room');
  }

  private async unreadForMembership(
    roomId: string,
    lastReadMessageId: string | null,
    userId: string,
  ): Promise<number> {
    if (!lastReadMessageId) {
      return this.prisma.message.count({
        where: { roomId, deletedAt: null, NOT: { senderId: userId } },
      });
    }
    const cursor = await this.prisma.message.findUnique({
      where: { id: lastReadMessageId },
      select: { createdAt: true },
    });
    if (!cursor) return 0;
    return this.prisma.message.count({
      where: {
        roomId,
        deletedAt: null,
        createdAt: { gt: cursor.createdAt },
        NOT: { senderId: userId },
      },
    });
  }

  private async toRoomDto(roomId: string, callerId: string): Promise<ChatRoomDto> {
    const room = await this.prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: {
        participants: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        },
        _count: { select: { participants: true } },
      },
    });
    const lastMsg = await this.prisma.message.findFirst({
      where: { roomId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, body: true, senderId: true, createdAt: true },
    });
    const callerMembership = room.participants.find((p) => p.userId === callerId);
    const otherParticipant =
      room.kind === ChatRoomKind.DIRECT
        ? room.participants.find((p) => p.userId !== callerId)?.user ?? null
        : null;
    const unreadCount = await this.unreadForMembership(
      roomId,
      callerMembership?.lastReadMessageId ?? null,
      callerId,
    );
    return {
      id: room.id,
      kind: room.kind,
      name: room.name,
      courseId: room.courseId,
      otherParticipant,
      unreadCount,
      lastMessage: lastMsg
        ? {
            id: lastMsg.id,
            body: lastMsg.body,
            senderId: lastMsg.senderId,
            createdAt: lastMsg.createdAt.toISOString(),
          }
        : null,
      participantCount: room._count.participants,
      updatedAt: room.updatedAt.toISOString(),
    };
  }

  private toMessageDto(row: {
    id: string;
    roomId: string;
    senderId: string;
    sender: { fullName: string };
    body: string;
    fileId: string | null;
    file: { originalName: string } | null;
    editedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
  }): ChatMessageDto {
    return {
      id: row.id,
      roomId: row.roomId,
      senderId: row.senderId,
      senderName: row.sender.fullName,
      body: row.body,
      fileId: row.fileId,
      fileName: row.file?.originalName ?? null,
      editedAt: row.editedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ---- chat-eligibility helper (used by /api/users/searchable) ---------

  /**
   * Returns user-ids the caller is *allowed* to start a DIRECT chat with.
   * Rules:
   *   - TEACHER ↔ STUDENT/PARENT of any of their enrolled-in-their-course students
   *   - STUDENT/PARENT ↔ TEACHER of their enrolled-in / linked courses
   *   - everyone ↔ ADMIN, ADMIN ↔ everyone
   * Used by the "new chat" picker so users don't see the full directory.
   */
  async listChatablePeers(ctx: CourseAuthCtx): Promise<Array<{ id: string; fullName: string; email: string; role: Role }>> {
    if (ctx.role === Role.ADMIN) {
      const all = await this.prisma.user.findMany({
        where: { id: { not: ctx.userId }, deletedAt: null },
        select: { id: true, fullName: true, email: true, role: true },
        orderBy: { fullName: 'asc' },
        take: 200,
      });
      return all;
    }
    const peerIds = new Set<string>();

    if (ctx.role === Role.TEACHER) {
      // All students currently enrolled in the teacher's courses.
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
          course: { teacherId: ctx.userId },
        },
        select: { studentId: true },
      });
      enrollments.forEach((e) => peerIds.add(e.studentId));
      // And parents linked to those students.
      const parents = await this.prisma.parentChildLink.findMany({
        where: { status: 'APPROVED', childId: { in: [...peerIds] } },
        select: { parentId: true },
      });
      parents.forEach((p) => peerIds.add(p.parentId));
    } else if (ctx.role === Role.STUDENT) {
      // Teachers of courses I'm enrolled in.
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          studentId: ctx.userId,
          status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
        },
        select: { course: { select: { teacherId: true } } },
      });
      enrollments.forEach((e) => peerIds.add(e.course.teacherId));
    } else if (ctx.role === Role.PARENT) {
      // Teachers of courses my children are enrolled in.
      const childIds = (
        await this.prisma.parentChildLink.findMany({
          where: { parentId: ctx.userId, status: 'APPROVED' },
          select: { childId: true },
        })
      ).map((l) => l.childId);
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          studentId: { in: childIds },
          status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
        },
        select: { course: { select: { teacherId: true } } },
      });
      enrollments.forEach((e) => peerIds.add(e.course.teacherId));
    }

    // Admins are always reachable.
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, deletedAt: null, id: { not: ctx.userId } },
      select: { id: true },
    });
    admins.forEach((a) => peerIds.add(a.id));

    if (peerIds.size === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...peerIds] }, deletedAt: null },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
    });
    return users;
  }
}
