import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { LessonProgressService } from '@/lib/lesson-progress/service';

export const runtime = 'nodejs';

/** POST — record that the current student opened this lesson (idempotent). */
export const POST = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new LessonProgressService(prisma);
  return NextResponse.json(await svc.recordView(params.id, user.id));
});
