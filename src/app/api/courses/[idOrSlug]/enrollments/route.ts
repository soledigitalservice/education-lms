import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { EnrollmentsService } from '@/lib/enrollments/service';
import { listEnrollmentsQuerySchema } from '@/lib/enrollments/schemas';

export const runtime = 'nodejs';

/** GET /api/courses/:idOrSlug/enrollments — teacher-owner or admin only. */
export const GET = route<{ idOrSlug: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const courses = new CoursesService(prisma);
  const course = await courses.getByIdOrSlug(params.idOrSlug, {
    userId: user.id,
    role: user.role,
  });
  const q = readQuery(req, listEnrollmentsQuerySchema);
  const enrollments = new EnrollmentsService(prisma);
  return NextResponse.json(
    await enrollments.listForCourse(course.id, q.status, { userId: user.id, role: user.role }),
  );
});

/** POST /api/courses/:idOrSlug/enrollments — student requests enrollment. */
export const POST = route<{ idOrSlug: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const courses = new CoursesService(prisma);
  const course = await courses.getByIdOrSlug(params.idOrSlug, {
    userId: user.id,
    role: user.role,
  });
  const enrollments = new EnrollmentsService(prisma);
  return NextResponse.json(
    await enrollments.request(course.id, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});

/** DELETE /api/courses/:idOrSlug/enrollments — student leaves the course. */
export const DELETE = route<{ idOrSlug: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const courses = new CoursesService(prisma);
  const course = await courses.getByIdOrSlug(params.idOrSlug, {
    userId: user.id,
    role: user.role,
  });
  const enrollments = new EnrollmentsService(prisma);
  await enrollments.leave(course.id, { userId: user.id, role: user.role });
  return new NextResponse(null, { status: 204 });
});
