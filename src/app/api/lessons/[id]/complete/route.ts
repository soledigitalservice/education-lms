import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { LessonProgressService } from '@/lib/lesson-progress/service';
import { setCompletedSchema } from '@/lib/lesson-progress/schemas';

export const runtime = 'nodejs';

/** PUT — mark the lesson complete/incomplete for the current student. */
export const PUT = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const { completed } = await readJson(req, setCompletedSchema);
  const svc = new LessonProgressService(prisma);
  return NextResponse.json(await svc.setCompleted(params.id, user.id, completed));
});
