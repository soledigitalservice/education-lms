import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { QuizAttemptsService } from '@/lib/quiz-attempts/service';

export const runtime = 'nodejs';

/** GET — teacher lists every attempt. */
export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new QuizAttemptsService(prisma);
  return NextResponse.json(
    await svc.listForQuiz(params.id, { userId: user.id, role: user.role }),
  );
});

/** POST — student starts (or resumes) an attempt. */
export const POST = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new QuizAttemptsService(prisma);
  return NextResponse.json(
    await svc.start(params.id, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});
