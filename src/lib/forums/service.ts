import {
  AuditAction,
  EnrollmentStatus,
  NotificationKind,
  Prisma,
  Role,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import { NotificationsService } from '../notifications/service';
import type {
  CreatePostInput,
  CreateThreadInput,
  ModerateThreadInput,
  UpdatePostInput,
} from './schemas';

export interface ForumDto {
  id: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
}

export interface ForumThreadDto {
  id: string;
  forumId: string;
  title: string;
  author: { id: string; fullName: string };
  pinned: boolean;
  locked: boolean;
  postCount: number;
  lastActivityAt: string;
  createdAt: string;
}

export interface ForumPostDto {
  id: string;
  threadId: string;
  author: { id: string; fullName: string };
  parentId: string | null;
  body: string;
  editedAt: string | null;
  createdAt: string;
}

export interface ThreadWithPostsDto {
  thread: ForumThreadDto;
  posts: ForumPostDto[];
}

/**
 * Forums are per-course. The Forum row is auto-created on first access by
 * any caller with read permission (so legacy seeded courses without one
 * still work). Threads + posts inherit the course's enrollment rules.
 */
export class ForumsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- forum boundary --------------------------------------------------

  async getForCourse(courseId: string, ctx: CourseAuthCtx): Promise<ForumDto> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deletedAt: null },
      select: { id: true, slug: true, title: true, teacherId: true },
    });
    if (!course) throw ApiError.notFound('Course not found');
    await this.ensureCanRead(course, ctx);

    let forum = await this.prisma.forum.findUnique({
      where: { courseId },
      select: { id: true },
    });
    if (!forum) {
      forum = await this.prisma.forum.create({
        data: { courseId },
        select: { id: true },
      });
    }
    return { id: forum.id, courseId: course.id, courseSlug: course.slug, courseTitle: course.title };
  }

  async listThreads(courseId: string, ctx: CourseAuthCtx): Promise<ForumThreadDto[]> {
    const forum = await this.getForCourse(courseId, ctx);
    const rows = await this.prisma.forumThread.findMany({
      where: { forumId: forum.id },
      include: {
        author: { select: { id: true, fullName: true } },
        _count: { select: { posts: true } },
      },
      // Pinned first, then by most-recent activity.
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((r) => this.toThreadDto(r));
  }

  // ---- threads ---------------------------------------------------------

  async createThread(
    courseId: string,
    input: CreateThreadInput,
    ctx: CourseAuthCtx,
  ): Promise<ForumThreadDto> {
    const forum = await this.getForCourse(courseId, ctx);
    // The opening post + the thread row are created in one transaction so
    // the count is consistent and there's never an empty thread.
    const result = await this.prisma.$transaction(async (tx) => {
      const thread = await tx.forumThread.create({
        data: {
          forumId: forum.id,
          authorId: ctx.userId,
          title: input.title.trim(),
          posts: {
            create: { authorId: ctx.userId, body: input.body.trim() },
          },
        },
        include: {
          author: { select: { id: true, fullName: true } },
          _count: { select: { posts: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.CREATE,
          entity: 'ForumThread',
          entityId: thread.id,
          metadata: { forumId: forum.id, courseId },
        },
      });
      return thread;
    });
    return this.toThreadDto(result);
  }

  async getThread(threadId: string, ctx: CourseAuthCtx): Promise<ThreadWithPostsDto> {
    const thread = await this.prisma.forumThread.findUnique({
      where: { id: threadId },
      include: {
        author: { select: { id: true, fullName: true } },
        _count: { select: { posts: true } },
        forum: {
          select: {
            course: { select: { id: true, teacherId: true, deletedAt: true } },
          },
        },
        posts: {
          include: { author: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!thread || thread.forum.course.deletedAt) throw ApiError.notFound('Thread not found');
    await this.ensureCanRead(thread.forum.course, ctx);
    return {
      thread: this.toThreadDto(thread),
      posts: thread.posts.map((p) => this.toPostDto(p, threadId)),
    };
  }

  async moderateThread(
    threadId: string,
    input: ModerateThreadInput,
    ctx: CourseAuthCtx,
  ): Promise<ForumThreadDto> {
    const thread = await this.loadThreadWithCourse(threadId);
    this.ensureCanModerate(thread.forum.course, ctx);
    const updated = await this.prisma.forumThread.update({
      where: { id: threadId },
      data: {
        pinned: input.pinned ?? thread.pinned,
        locked: input.locked ?? thread.locked,
      },
      include: {
        author: { select: { id: true, fullName: true } },
        _count: { select: { posts: true } },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.UPDATE,
        entity: 'ForumThread',
        entityId: threadId,
        metadata: { event: 'moderate', pinned: updated.pinned, locked: updated.locked },
      },
    });
    return this.toThreadDto(updated);
  }

  async deleteThread(threadId: string, ctx: CourseAuthCtx): Promise<void> {
    const thread = await this.loadThreadWithCourse(threadId);
    const isAuthor = thread.authorId === ctx.userId;
    const isMod = this.canModerate(thread.forum.course, ctx);
    if (!isAuthor && !isMod) throw ApiError.forbidden('Cannot delete this thread');
    await this.prisma.$transaction([
      this.prisma.forumThread.delete({ where: { id: threadId } }),
      this.prisma.auditLog.create({
        data: {
          actorId: ctx.userId,
          action: AuditAction.DELETE,
          entity: 'ForumThread',
          entityId: threadId,
          metadata: { forumId: thread.forumId },
        },
      }),
    ]);
  }

  // ---- posts -----------------------------------------------------------

  async createPost(
    threadId: string,
    input: CreatePostInput,
    ctx: CourseAuthCtx,
  ): Promise<ForumPostDto> {
    const thread = await this.loadThreadWithCourse(threadId);
    if (thread.locked) throw ApiError.badRequest('Thread is locked');
    await this.ensureCanRead(thread.forum.course, ctx);

    // Flatten replies-of-replies to a single level: if parentId itself has a parent, use that.
    let parentId: string | null = null;
    let parentAuthorId: string | null = null;
    if (input.parentId) {
      const parent = await this.prisma.forumPost.findUnique({
        where: { id: input.parentId },
        select: { id: true, threadId: true, parentId: true, authorId: true },
      });
      if (!parent || parent.threadId !== threadId) {
        throw ApiError.badRequest('Parent post does not belong to this thread');
      }
      parentId = parent.parentId ?? parent.id;
      parentAuthorId = parent.authorId;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const post = await tx.forumPost.create({
        data: {
          threadId,
          authorId: ctx.userId,
          parentId,
          body: input.body.trim(),
        },
        include: { author: { select: { id: true, fullName: true } } },
      });
      // Bump thread.updatedAt so the activity sort reflects the new post.
      await tx.forumThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });
      return post;
    });

    // Best-effort: notify the thread author and the parent post author (if any),
    // skipping the caller themselves to avoid self-notifications.
    void this.notifyReplies({
      threadId,
      threadTitle: thread.title,
      threadAuthorId: thread.authorId,
      parentAuthorId,
      courseSlug: await this.resolveCourseSlug(thread.forum.course.id),
      actorId: ctx.userId,
    });

    return this.toPostDto(created, threadId);
  }

  async updatePost(
    postId: string,
    input: UpdatePostInput,
    ctx: CourseAuthCtx,
  ): Promise<ForumPostDto> {
    const post = await this.loadPostWithCourse(postId);
    if (post.authorId !== ctx.userId && ctx.role !== Role.ADMIN) {
      throw ApiError.forbidden('Not your post');
    }
    if (post.deletedAt) throw ApiError.badRequest('Post has been deleted');
    const updated = await this.prisma.forumPost.update({
      where: { id: postId },
      data: { body: input.body.trim(), editedAt: new Date() },
      include: { author: { select: { id: true, fullName: true } } },
    });
    return this.toPostDto(updated, post.threadId);
  }

  async deletePost(postId: string, ctx: CourseAuthCtx): Promise<void> {
    const post = await this.loadPostWithCourse(postId);
    const isAuthor = post.authorId === ctx.userId;
    const isMod = this.canModerate(post.thread.forum.course, ctx);
    if (!isAuthor && !isMod) throw ApiError.forbidden('Cannot delete this post');
    // Soft delete to preserve threading + audit; UI shows "[mensaje eliminado]".
    await this.prisma.forumPost.update({
      where: { id: postId },
      data: { deletedAt: new Date(), body: '' },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: AuditAction.DELETE,
        entity: 'ForumPost',
        entityId: postId,
        metadata: { threadId: post.threadId },
      },
    });
  }

  // ---- helpers ---------------------------------------------------------

  private async resolveCourseSlug(courseId: string): Promise<string> {
    const c = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { slug: true },
    });
    return c?.slug ?? '';
  }

  private async notifyReplies(args: {
    threadId: string;
    threadTitle: string;
    threadAuthorId: string;
    parentAuthorId: string | null;
    courseSlug: string;
    actorId: string;
  }): Promise<void> {
    const targets = new Set<string>();
    if (args.threadAuthorId !== args.actorId) targets.add(args.threadAuthorId);
    if (args.parentAuthorId && args.parentAuthorId !== args.actorId) {
      targets.add(args.parentAuthorId);
    }
    if (targets.size === 0) return;
    const notifications = new NotificationsService(this.prisma);
    for (const userId of targets) {
      await notifications.dispatch({
        userId,
        kind: NotificationKind.FORUM_REPLY,
        title: args.threadTitle,
        body: 'Has recibido una respuesta en una discusión del foro.',
        link: `/courses/${args.courseSlug}/forum/${args.threadId}`,
        // No dedup — every reply should notify (it's not a recurring scan).
      });
    }
  }

  private async loadThreadWithCourse(threadId: string) {
    const t = await this.prisma.forumThread.findUnique({
      where: { id: threadId },
      include: {
        forum: {
          select: { id: true, courseId: true, course: { select: { id: true, teacherId: true, deletedAt: true } } },
        },
      },
    });
    if (!t || t.forum.course.deletedAt) throw ApiError.notFound('Thread not found');
    return t;
  }

  private async loadPostWithCourse(postId: string) {
    const p = await this.prisma.forumPost.findUnique({
      where: { id: postId },
      include: {
        thread: {
          select: {
            id: true,
            forum: {
              select: {
                course: { select: { id: true, teacherId: true, deletedAt: true } },
              },
            },
          },
        },
      },
    });
    if (!p || p.thread.forum.course.deletedAt) throw ApiError.notFound('Post not found');
    return p;
  }

  private async ensureCanRead(
    course: { id: string; teacherId: string },
    ctx: CourseAuthCtx,
  ): Promise<void> {
    if (ctx.role === Role.ADMIN || course.teacherId === ctx.userId) return;
    const enr = await this.prisma.enrollment.findFirst({
      where: {
        courseId: course.id,
        studentId: ctx.userId,
        status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] },
      },
      select: { id: true },
    });
    if (!enr) throw ApiError.forbidden('Not enrolled in this course');
  }

  private canModerate(course: { teacherId: string }, ctx: CourseAuthCtx): boolean {
    return ctx.role === Role.ADMIN || course.teacherId === ctx.userId;
  }

  private ensureCanModerate(
    course: { teacherId: string },
    ctx: CourseAuthCtx,
  ): void {
    if (!this.canModerate(course, ctx)) throw ApiError.forbidden('Only teacher or admin can moderate');
  }

  private toThreadDto(
    row: {
      id: string;
      forumId: string;
      title: string;
      author: { id: string; fullName: string };
      pinned: boolean;
      locked: boolean;
      _count: { posts: number };
      createdAt: Date;
      updatedAt: Date;
    },
  ): ForumThreadDto {
    return {
      id: row.id,
      forumId: row.forumId,
      title: row.title,
      author: row.author,
      pinned: row.pinned,
      locked: row.locked,
      postCount: row._count.posts,
      lastActivityAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toPostDto(
    row: {
      id: string;
      author: { id: string; fullName: string };
      parentId: string | null;
      body: string;
      editedAt: Date | null;
      deletedAt?: Date | null;
      createdAt: Date;
    },
    threadId: string,
  ): ForumPostDto {
    return {
      id: row.id,
      threadId,
      author: row.author,
      parentId: row.parentId,
      body: row.deletedAt ? '[mensaje eliminado]' : row.body,
      editedAt: row.editedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

// Silence unused warning in environments where this file is type-checked but not run.
void Prisma;
