import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { ForumsService } from '@/lib/forums/service';

export const runtime = 'nodejs';

/** GET /api/courses/:idOrSlug/forum — get-or-create forum + list threads. */
export const GET = route<{ idOrSlug: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const courses = new CoursesService(prisma);
  const course = await courses.getByIdOrSlug(params.idOrSlug, { userId: user.id, role: user.role });
  const forums = new ForumsService(prisma);
  const [forum, threads] = await Promise.all([
    forums.getForCourse(course.id, { userId: user.id, role: user.role }),
    forums.listThreads(course.id, { userId: user.id, role: user.role }),
  ]);
  return NextResponse.json({ forum, threads });
});
