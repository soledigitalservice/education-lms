import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { TeacherReviewsService } from '@/lib/teacher-reviews/service';

export const runtime = 'nodejs';

export const DELETE = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new TeacherReviewsService(prisma);
  await svc.remove(params.id, { userId: user.id, role: user.role });
  return new NextResponse(null, { status: 204 });
});
