import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { MaterialsService } from '@/lib/materials/service';
import { createMaterialSchema } from '@/lib/materials/schemas';

export const runtime = 'nodejs';

export const GET = route<{ idOrSlug: string }>(async (_req, { params }) => {
  const user = await requireSession();
  const courses = new CoursesService(prisma);
  const course = await courses.getByIdOrSlug(params.idOrSlug, { userId: user.id, role: user.role });
  const svc = new MaterialsService(prisma);
  return NextResponse.json(
    await svc.listForCourse(course.id, { userId: user.id, role: user.role }),
  );
});

export const POST = route<{ idOrSlug: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, createMaterialSchema);
  const courses = new CoursesService(prisma);
  const course = await courses.getByIdOrSlug(params.idOrSlug, { userId: user.id, role: user.role });
  const svc = new MaterialsService(prisma);
  return NextResponse.json(
    await svc.createForCourse(course.id, body, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});
