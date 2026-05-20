import {
  AuditAction,
  NotificationKind,
  ParentLinkStatus,
  Prisma,
  Role,
  type PrismaClient,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';

import { ApiError } from '../api/errors';
import type { CourseAuthCtx } from '../courses/service';
import { NotificationsService } from '../notifications/service';
import type { DecideLinkInput, RequestLinkInput } from './schemas';

export interface ParentLinkDto {
  id: string;
  status: ParentLinkStatus;
  requestedAt: string;
  decidedAt: string | null;
  notes: string | null;
  parent: { id: string; fullName: string; email: string };
  child: { id: string; fullName: string; email: string; avatarUrl: string | null };
}

/**
 * Generates a short-lived invite token (used in Capa 9 when we email the
 * student a "click here to accept" link). For Capa 5, the in-app flow
 * doesn't need the token — the student accepts via the API directly. We
 * still issue + persist the hash so the email flow drops in seamlessly later.
 */
function generateInviteToken(): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(24).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
}

export class ParentLinksService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---- parent-side -----------------------------------------------------

  /**
   * Parent requests to link to a student by email. The student must already
   * exist with role=STUDENT. Returns the persisted link (PENDING) plus the
   * plain-text invite token — the parent can hand it to the child manually
   * if needed; otherwise the in-app inbox is sufficient.
   */
  async request(
    input: RequestLinkInput,
    ctx: CourseAuthCtx,
  ): Promise<{ link: ParentLinkDto; inviteToken: string }> {
    if (ctx.role !== Role.PARENT && ctx.role !== Role.ADMIN) {
      throw ApiError.forbidden('Only parents can request a parent-child link');
    }
    const emailNorm = input.childEmail.toLowerCase().trim();
    const child = await this.prisma.user.findUnique({ where: { email: emailNorm } });
    if (!child || child.deletedAt) throw ApiError.notFound('No student with that email');
    if (child.role !== Role.STUDENT) throw ApiError.badRequest('That account is not a student');
    if (child.id === ctx.userId) throw ApiError.badRequest('Cannot link to yourself');

    const existing = await this.prisma.parentChildLink.findUnique({
      where: { parentId_childId: { parentId: ctx.userId, childId: child.id } },
    });
    if (existing) {
      // Idempotent for in-flight; revive REJECTED/REVOKED on re-request.
      if (existing.status === ParentLinkStatus.PENDING || existing.status === ParentLinkStatus.APPROVED) {
        return {
          link: await this.reloadDto(existing.id),
          inviteToken: '',
        };
      }
      const { token, hash, expiresAt } = generateInviteToken();
      const revived = await this.prisma.parentChildLink.update({
        where: { id: existing.id },
        data: {
          status: ParentLinkStatus.PENDING,
          inviteTokenHash: hash,
          inviteExpiresAt: expiresAt,
          requestedAt: new Date(),
          decidedAt: null,
          decidedById: null,
          notes: input.notes ?? null,
        },
      });
      return { link: await this.reloadDto(revived.id), inviteToken: token };
    }

    const { token, hash, expiresAt } = generateInviteToken();
    const created = await this.prisma.parentChildLink.create({
      data: {
        parentId: ctx.userId,
        childId: child.id,
        status: ParentLinkStatus.PENDING,
        inviteTokenHash: hash,
        inviteExpiresAt: expiresAt,
        notes: input.notes ?? null,
      },
    });
    await this.audit(ctx.userId, AuditAction.CREATE, created.id, {
      parentId: ctx.userId,
      childId: child.id,
    });

    // Notify the child that a parent wants to link to them.
    void new NotificationsService(this.prisma).dispatch({
      userId: child.id,
      kind: NotificationKind.PARENT_LINK_REQUESTED,
      title: 'Solicitud de vínculo padre/madre',
      body: 'Un familiar te ha enviado una solicitud para vincularse a tu cuenta. Acéptala o recházala desde Familia.',
      link: '/family',
    });

    return { link: await this.reloadDto(created.id), inviteToken: token };
  }

  /** Parent (or admin) revokes an existing link (APPROVED or PENDING). */
  async revoke(linkId: string, ctx: CourseAuthCtx): Promise<ParentLinkDto> {
    const link = await this.loadOrThrow(linkId);
    if (ctx.role !== Role.ADMIN && link.parentId !== ctx.userId) {
      throw ApiError.forbidden('Not your link');
    }
    if (link.status === ParentLinkStatus.REVOKED) return this.toDto(link);

    const updated = await this.prisma.parentChildLink.update({
      where: { id: linkId },
      data: {
        status: ParentLinkStatus.REVOKED,
        decidedAt: new Date(),
        decidedById: ctx.userId,
      },
      include: this.fullInclude(),
    });
    await this.audit(ctx.userId, AuditAction.UPDATE, linkId, { event: 'revoked' });
    return this.toDto(updated);
  }

  // ---- student-side ----------------------------------------------------

  async approve(linkId: string, input: DecideLinkInput, ctx: CourseAuthCtx): Promise<ParentLinkDto> {
    const link = await this.loadOrThrow(linkId);
    if (link.childId !== ctx.userId) {
      throw ApiError.forbidden('Only the invited student can approve this link');
    }
    if (link.status === ParentLinkStatus.APPROVED) return this.toDto(link);
    if (link.status !== ParentLinkStatus.PENDING) {
      throw ApiError.badRequest(`Cannot approve a link in ${link.status} state`);
    }
    if (link.inviteExpiresAt && link.inviteExpiresAt < new Date()) {
      throw ApiError.badRequest('Invitation expired. Ask the parent to send a new one.');
    }

    const updated = await this.prisma.parentChildLink.update({
      where: { id: linkId },
      data: {
        status: ParentLinkStatus.APPROVED,
        decidedAt: new Date(),
        decidedById: ctx.userId,
        notes: input.notes ?? link.notes,
        // Invalidate the token once consumed.
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
      include: this.fullInclude(),
    });
    await this.audit(ctx.userId, AuditAction.APPROVE, linkId, {});

    // Notify the parent that the child accepted the link.
    void new NotificationsService(this.prisma).dispatch({
      userId: link.parentId,
      kind: NotificationKind.PARENT_LINK_APPROVED,
      title: 'Vínculo aprobado',
      body: `${updated.child.fullName} ha aceptado tu solicitud. Ya puedes ver sus cursos y notas.`,
      link: `/family/${link.childId}`,
    });

    return this.toDto(updated);
  }

  async reject(linkId: string, input: DecideLinkInput, ctx: CourseAuthCtx): Promise<ParentLinkDto> {
    const link = await this.loadOrThrow(linkId);
    if (link.childId !== ctx.userId) {
      throw ApiError.forbidden('Only the invited student can reject this link');
    }
    if (link.status !== ParentLinkStatus.PENDING) {
      throw ApiError.badRequest(`Cannot reject a link in ${link.status} state`);
    }

    const updated = await this.prisma.parentChildLink.update({
      where: { id: linkId },
      data: {
        status: ParentLinkStatus.REJECTED,
        decidedAt: new Date(),
        decidedById: ctx.userId,
        notes: input.notes ?? link.notes,
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
      include: this.fullInclude(),
    });
    await this.audit(ctx.userId, AuditAction.REJECT, linkId, {});
    return this.toDto(updated);
  }

  // ---- read ------------------------------------------------------------

  /** Returns all links the caller participates in (as parent OR child). */
  async listMine(ctx: CourseAuthCtx): Promise<ParentLinkDto[]> {
    const rows = await this.prisma.parentChildLink.findMany({
      where: { OR: [{ parentId: ctx.userId }, { childId: ctx.userId }] },
      include: this.fullInclude(),
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  /** Approved child user-ids for the given parent — the authoritative gate. */
  async approvedChildIds(parentId: string): Promise<string[]> {
    const rows = await this.prisma.parentChildLink.findMany({
      where: { parentId, status: ParentLinkStatus.APPROVED },
      select: { childId: true },
    });
    return rows.map((r) => r.childId);
  }

  /**
   * Throws 403 if the caller is not a parent with an APPROVED link to childId.
   * ADMIN bypasses this check.
   */
  async assertParentOf(childId: string, ctx: CourseAuthCtx): Promise<void> {
    if (ctx.role === Role.ADMIN) return;
    if (ctx.role !== Role.PARENT) throw ApiError.forbidden('Not a parent');
    const link = await this.prisma.parentChildLink.findUnique({
      where: { parentId_childId: { parentId: ctx.userId, childId } },
      select: { status: true },
    });
    if (!link || link.status !== ParentLinkStatus.APPROVED) {
      throw ApiError.forbidden('No approved link to that student');
    }
  }

  // ---- helpers ---------------------------------------------------------

  private async loadOrThrow(linkId: string) {
    const link = await this.prisma.parentChildLink.findUnique({
      where: { id: linkId },
      include: this.fullInclude(),
    });
    if (!link) throw ApiError.notFound('Link not found');
    return link;
  }

  private async reloadDto(linkId: string): Promise<ParentLinkDto> {
    const fresh = await this.prisma.parentChildLink.findUniqueOrThrow({
      where: { id: linkId },
      include: this.fullInclude(),
    });
    return this.toDto(fresh);
  }

  private fullInclude() {
    return {
      parent: { select: { id: true, fullName: true, email: true } },
      child: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
    } satisfies Prisma.ParentChildLinkInclude;
  }

  private audit(actorId: string, action: AuditAction, entityId: string, metadata: Prisma.JsonValue) {
    return this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        entity: 'ParentChildLink',
        entityId,
        metadata: metadata ?? undefined,
      },
    });
  }

  private toDto(
    row: Prisma.ParentChildLinkGetPayload<{ include: ReturnType<ParentLinksService['fullInclude']> }>,
  ): ParentLinkDto {
    return {
      id: row.id,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      notes: row.notes,
      parent: row.parent,
      child: row.child,
    };
  }
}
