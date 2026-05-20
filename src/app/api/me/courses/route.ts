import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { Roles } from '@/lib/rbac/roles';

export const runtime = 'nodejs';

/**
 * GET /api/me/courses
 *   - TEACHER: courses they own (any status)
 *   - ADMIN  : courses they own (admins can also list via /api/courses?status=all)
 *   - Others: 400 — use /api/me/enrollments instead.
 */
export const GET = route(async () => {
  const user = await requireSession();
  if (user.role !== Roles.TEACHER && user.role !== Roles.ADMIN) {
    throw ApiError.badRequest(
      'Only teachers and admins have taught courses. Students should use /api/me/enrollments.',
    );
  }
  const svc = new CoursesService(prisma);
  return NextResponse.json(await svc.listTaughtBy(user.id));
});
