import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CoursesService } from '@/lib/courses/service';

export const runtime = 'nodejs';

export const POST = route<{ idOrSlug: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new CoursesService(prisma);
  const course = await svc.getByIdOrSlug(params.idOrSlug, { userId: user.id, role: user.role });
  return NextResponse.json(
    await svc.publish(course.id, { userId: user.id, role: user.role }),
  );
});
