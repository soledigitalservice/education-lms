import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { Roles } from '@/lib/rbac/roles';

export const runtime = 'nodejs';

/**
 * GET /api/me/children — for PARENT only. Returns the list of children the
 * caller is APPROVED-linked to, with light profile + counts useful for the
 * family dashboard.
 */
export const GET = route(async () => {
  const user = await requireSession();
  if (user.role !== Roles.PARENT && user.role !== Roles.ADMIN) {
    throw ApiError.forbidden('Only parents have children');
  }

  const links = await prisma.parentChildLink.findMany({
    where: { parentId: user.id, status: 'APPROVED' },
    include: {
      child: {
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          studentProfile: { select: { schoolName: true, gradeLevel: true } },
          _count: {
            select: {
              enrollments: { where: { status: 'ACTIVE' } },
              gradesReceived: true,
            },
          },
        },
      },
    },
    orderBy: { decidedAt: 'desc' },
  });

  return NextResponse.json(
    links.map((l) => ({
      childId: l.child.id,
      fullName: l.child.fullName,
      email: l.child.email,
      avatarUrl: l.child.avatarUrl,
      schoolName: l.child.studentProfile?.schoolName ?? null,
      gradeLevel: l.child.studentProfile?.gradeLevel ?? null,
      activeEnrollmentCount: l.child._count.enrollments,
      gradeCount: l.child._count.gradesReceived,
      linkedAt: l.decidedAt?.toISOString() ?? l.requestedAt.toISOString(),
    })),
  );
});
