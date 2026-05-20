import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson, readQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { createCourseSchema, listCoursesQuerySchema } from '@/lib/courses/schemas';

export const runtime = 'nodejs';

/** GET /api/courses — catalog with filters + pagination. */
export const GET = route(async (req: NextRequest) => {
  const user = await requireSession();
  const q = readQuery(req, listCoursesQuerySchema);
  const svc = new CoursesService(prisma);
  return NextResponse.json(await svc.list(q, { userId: user.id, role: user.role }));
});

/** POST /api/courses — create (teacher / admin). */
export const POST = route(async (req: NextRequest) => {
  const user = await requireSession();
  const body = await readJson(req, createCourseSchema);
  const svc = new CoursesService(prisma);
  const created = await svc.create(body, { userId: user.id, role: user.role });
  return NextResponse.json(created, { status: 201 });
});
