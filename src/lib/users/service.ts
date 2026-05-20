import {
  AccountStatus,
  AuditAction,
  NotificationKind,
  Prisma,
  Role,
  type PrismaClient,
} from '@prisma/client';

import { ApiError } from '../api/errors';
import type { PublicUserDto } from '../auth/service';
import { NotificationsService } from '../notifications/service';

export interface ListUsersFilter {
  role?: Role;
  status?: AccountStatus;
  q?: string;
  page: number;
  pageSize: number;
}

export interface PaginatedUsers {
  items: PublicUserDto[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * User moderation service — admin endpoints + user reads.
 * Same pattern as AuthService: Prisma injected for testability.
 */
export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filter: ListUsersFilter): Promise<PaginatedUsers> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(filter.role ? { role: filter.role } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q
        ? {
            OR: [
              { email: { contains: filter.q, mode: 'insensitive' } },
              { fullName: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
    ]);

    return {
      items: rows.map(this.toDto),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async listPendingTeachers(): Promise<PublicUserDto[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: Role.TEACHER, status: AccountStatus.PENDING_APPROVAL, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(this.toDto);
  }

  async getById(id: string): Promise<PublicUserDto> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || u.deletedAt) throw ApiError.notFound('User not found');
    return this.toDto(u);
  }

  async approveTeacher(teacherId: string, adminId: string, note?: string): Promise<PublicUserDto> {
    const t = await this.prisma.user.findUnique({ where: { id: teacherId } });
    if (!t || t.deletedAt) throw ApiError.notFound('Teacher not found');
    if (t.role !== Role.TEACHER) throw ApiError.badRequest('User is not a teacher');
    if (t.status === AccountStatus.ACTIVE) return this.toDto(t); // idempotent
    if (t.status !== AccountStatus.PENDING_APPROVAL) {
      throw ApiError.badRequest(`Cannot approve teacher in ${t.status} state`);
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: teacherId },
        data: { status: AccountStatus.ACTIVE },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: AuditAction.APPROVE,
          entity: 'User',
          entityId: teacherId,
          metadata: { previousStatus: t.status, newStatus: 'ACTIVE', note: note ?? null },
        },
      }),
    ]);

    void new NotificationsService(this.prisma).dispatch({
      userId: teacherId,
      kind: NotificationKind.TEACHER_APPROVED,
      title: 'Cuenta aprobada',
      body: 'Tu solicitud de profesor ha sido aprobada. Ya puedes iniciar sesión y crear tu primer curso.',
      link: '/dashboard',
    });

    return this.toDto(updated);
  }

  async rejectTeacher(teacherId: string, adminId: string, reason?: string): Promise<PublicUserDto> {
    const t = await this.prisma.user.findUnique({ where: { id: teacherId } });
    if (!t || t.deletedAt) throw ApiError.notFound('Teacher not found');
    if (t.role !== Role.TEACHER) throw ApiError.badRequest('User is not a teacher');
    if (t.status !== AccountStatus.PENDING_APPROVAL) {
      throw ApiError.badRequest(`Cannot reject teacher in ${t.status} state`);
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: teacherId },
        data: { status: AccountStatus.REJECTED },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: AuditAction.REJECT,
          entity: 'User',
          entityId: teacherId,
          metadata: { reason: reason ?? null },
        },
      }),
    ]);

    void new NotificationsService(this.prisma).dispatch({
      userId: teacherId,
      kind: NotificationKind.TEACHER_REJECTED,
      title: 'Solicitud rechazada',
      body: reason ? `Motivo: ${reason}` : 'Tu solicitud de profesor ha sido rechazada por un administrador.',
    });

    return this.toDto(updated);
  }

  async suspend(userId: string, adminId: string, reason?: string): Promise<PublicUserDto> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.deletedAt) throw ApiError.notFound('User not found');
    if (u.id === adminId) throw ApiError.badRequest('Admins cannot suspend themselves');
    if (u.status === AccountStatus.SUSPENDED) return this.toDto(u);

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: AccountStatus.SUSPENDED },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: AuditAction.UPDATE,
          entity: 'User',
          entityId: userId,
          metadata: { previousStatus: u.status, newStatus: 'SUSPENDED', reason: reason ?? null },
        },
      }),
    ]);
    return this.toDto(updated);
  }

  async reactivate(userId: string, adminId: string): Promise<PublicUserDto> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.deletedAt) throw ApiError.notFound('User not found');
    if (u.status === AccountStatus.ACTIVE) return this.toDto(u);

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: AccountStatus.ACTIVE },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: AuditAction.UPDATE,
          entity: 'User',
          entityId: userId,
          metadata: { previousStatus: u.status, newStatus: 'ACTIVE' },
        },
      }),
    ]);
    return this.toDto(updated);
  }

  async softDelete(userId: string, adminId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.deletedAt) throw ApiError.notFound('User not found');
    if (u.id === adminId) throw ApiError.badRequest('Admins cannot delete themselves');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), status: AccountStatus.SUSPENDED },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: AuditAction.DELETE,
          entity: 'User',
          entityId: userId,
          metadata: { email: u.email, role: u.role },
        },
      }),
    ]);
  }

  private toDto(user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    status: AccountStatus;
    avatarUrl: string | null;
    phone: string | null;
    createdAt: Date;
  }): PublicUserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
