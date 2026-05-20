import { AccountStatus, Role, type PrismaClient } from '@prisma/client';

import { ApiError } from '../api/errors';
import { permissionsFor, type Permission } from '../rbac/permissions';
import { dummyVerify, hashPassword, verifyPassword } from './password';
import {
  generateRefreshToken,
  hashOpaqueToken,
  signAccessToken,
} from './tokens';

export interface PublicUserDto {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: AccountStatus;
  avatarUrl: string | null;
  phone: string | null;
  createdAt: string;
}

export interface SessionDto {
  user: PublicUserDto;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  permissions: Permission[];
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  role: Exclude<Role, 'ADMIN'>;
  phone?: string;
}

export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Auth service — pure business logic, takes a Prisma client by injection
 * so it can be unit-tested against an in-memory mock without spinning
 * up Postgres.
 */
export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  // ------------------------------------------------------------ register
  async register(
    input: RegisterInput,
    meta: RequestMeta,
  ): Promise<SessionDto | { status: 'pending_approval'; message: string }> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw ApiError.conflict('An account with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const initialStatus =
      input.role === Role.TEACHER ? AccountStatus.PENDING_APPROVAL : AccountStatus.ACTIVE;

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: input.fullName.trim(),
        role: input.role,
        status: initialStatus,
        phone: input.phone?.trim() || null,
        teacherProfile: input.role === Role.TEACHER ? { create: {} } : undefined,
        studentProfile: input.role === Role.STUDENT ? { create: {} } : undefined,
      },
    });

    if (initialStatus === AccountStatus.PENDING_APPROVAL) {
      return {
        status: 'pending_approval',
        message:
          'Your teacher account has been created and is awaiting administrator approval. ' +
          'You will be notified by email when it is approved.',
      };
    }

    return this.issueSession(user, meta);
  }

  // --------------------------------------------------------------- login
  async login(email: string, password: string, meta: RequestMeta): Promise<SessionDto> {
    const emailNorm = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: emailNorm } });

    // Constant-time-ish: dummy hash work when the user doesn't exist.
    if (!user) {
      await dummyVerify();
      throw ApiError.unauthorized('Invalid credentials');
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) throw ApiError.unauthorized('Invalid credentials');
    if (user.deletedAt) throw ApiError.unauthorized('Account no longer exists');

    switch (user.status) {
      case AccountStatus.PENDING_APPROVAL:
        throw ApiError.forbidden('Your account is pending administrator approval');
      case AccountStatus.REJECTED:
        throw ApiError.forbidden('Your account registration was rejected');
      case AccountStatus.SUSPENDED:
        throw ApiError.forbidden('Your account is suspended');
      case AccountStatus.ACTIVE:
        break;
    }

    return this.issueSession(user, meta);
  }

  // ------------------------------------------------------------- refresh
  async refresh(refreshToken: string, meta: RequestMeta): Promise<SessionDto> {
    if (!refreshToken || refreshToken.length < 32) {
      throw ApiError.unauthorized('Missing or malformed refresh token');
    }
    const tokenHash = hashOpaqueToken(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!existing) throw ApiError.unauthorized('Refresh token not recognized');

    // Token reuse detection: a revoked token presented again likely indicates theft.
    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw ApiError.unauthorized('Refresh token has already been used');
    }
    if (existing.expiresAt < new Date()) {
      throw ApiError.unauthorized('Refresh token has expired');
    }
    const user = existing.user;
    if (!user || user.deletedAt || user.status !== AccountStatus.ACTIVE) {
      throw ApiError.unauthorized('Account is not active');
    }

    // Rotate: create new, revoke old, in a single transaction.
    const next = generateRefreshToken();
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: next.tokenHash,
          userAgent: meta.userAgent,
          ipAddress: meta.ipAddress,
          expiresAt: next.expiresAt,
        },
      });
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedById: created.id },
      });
    });

    const access = await signAccessToken(user);
    return {
      user: this.toPublicUser(user),
      accessToken: access.token,
      refreshToken: next.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      permissions: [...permissionsFor(user.role)],
    };
  }

  // -------------------------------------------------------------- logout
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = hashOpaqueToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, userId },
        data: { revokedAt: new Date() },
      });
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ----------------------------------------------------------- internals
  private async issueSession(
    user: {
      id: string;
      email: string;
      fullName: string;
      role: Role;
      status: AccountStatus;
      avatarUrl: string | null;
      phone: string | null;
      createdAt: Date;
    },
    meta: RequestMeta,
  ): Promise<SessionDto> {
    const access = await signAccessToken(user);
    const next = generateRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: next.tokenHash,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt: next.expiresAt,
      },
    });

    return {
      user: this.toPublicUser(user),
      accessToken: access.token,
      refreshToken: next.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      permissions: [...permissionsFor(user.role)],
    };
  }

  private toPublicUser(user: {
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
