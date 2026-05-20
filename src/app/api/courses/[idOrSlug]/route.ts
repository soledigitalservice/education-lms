import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { updateCourseSchema } from '@/lib/courses/schemas';

export const runtime = 'nodejs';

export const GET = route<{ idOrSlug: string }>(async (_req, { params }) => {
  const user = await requireSession();
  const svc = new CoursesService(prisma);
  return NextResponse.json(
    await svc.getByIdOrSlug(params.idOrSlug, { userId: user.id, role: user.role }),
  );
});

export const PATCH = route<{ idOrSlug: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, updateCourseSchema);
  const svc = new CoursesService(prisma);
  // PATCH is by id only (slug-based PATCH would let users hit a different course
  // if the slug changes mid-flight). Resolve slug → id first.
  const course = await svc.getByIdOrSlug(params.idOrSlug, { userId: user.id, role: user.role });
  return NextResponse.json(
    await svc.update(course.id, body, { userId: user.id, role: user.role }),
  );
});

export const DELETE = route<{ idOrSlug: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new CoursesService(prisma);
  const course = await svc.getByIdOrSlug(params.idOrSlug, { userId: user.id, role: user.role });
  await svc.softDelete(course.id, { userId: user.id, role: user.role });
  return new NextResponse(null, { status: 204 });
});
