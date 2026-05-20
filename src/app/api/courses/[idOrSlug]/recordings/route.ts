import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';
import { RecordingsService } from '@/lib/recordings/service';

export const runtime = 'nodejs';

export const GET = route<{ idOrSlug: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const courses = new CoursesService(prisma);
  const course = await courses.getByIdOrSlug(params.idOrSlug, { userId: user.id, role: user.role });
  const svc = new RecordingsService(prisma);
  return NextResponse.json(
    await svc.listForCourse(course.id, { userId: user.id, role: user.role }),
  );
});
