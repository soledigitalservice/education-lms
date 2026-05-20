import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { ForumsService } from '@/lib/forums/service';
import { createThreadSchema } from '@/lib/forums/schemas';

export const runtime = 'nodejs';

export const POST = route<{ idOrSlug: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, createThreadSchema);
  const courses = new CoursesService(prisma);
  const course = await courses.getByIdOrSlug(params.idOrSlug, { userId: user.id, role: user.role });
  const forums = new ForumsService(prisma);
  return NextResponse.json(
    await forums.createThread(course.id, body, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});
