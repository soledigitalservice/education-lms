import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { QuizAttemptsService } from '@/lib/quiz-attempts/service';
import { submitAnswerSchema } from '@/lib/quiz-attempts/schemas';

export const runtime = 'nodejs';

export const PUT = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, submitAnswerSchema);
  const svc = new QuizAttemptsService(prisma);
  await svc.submitAnswer(params.id, body, { userId: user.id, role: user.role });
  return new NextResponse(null, { status: 204 });
});
