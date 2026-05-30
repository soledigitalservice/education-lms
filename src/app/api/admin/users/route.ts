import { AccountStatus, AuditAction, Role } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

import { ApiError } from '@/lib/api/errors';
import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireRole } from '@/lib/auth/session';
import { hashPassword } from '@/lib/auth/password';
import { adminCreateUserSchema } from '@/lib/auth/schemas';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * POST /api/admin/users — admin-only user creation.
 *
 * Public registration is disabled, so this is the only path to create a new
 * account. The admin's own session cookies are NOT touched (they stay logged
 * in as themselves). The created user is set ACTIVE — admins don't go through
 * the teacher-approval queue when they create a teacher.
 */
export const POST = route(async (req: NextRequest) => {
  const admin = await requireRole(Role.ADMIN);
  const input = await readJson(req, adminCreateUserSchema);

  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: input.fullName.trim(),
      role: input.role,
      status: AccountStatus.ACTIVE,
      phone: input.phone?.trim() || null,
      teacherProfile: input.role === Role.TEACHER ? { create: {} } : undefined,
      studentProfile: input.role === Role.STUDENT ? { create: {} } : undefined,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: user.id,
      metadata: { role: user.role, status: user.status },
    },
  });

  return NextResponse.json(user, { status: 201 });
});
