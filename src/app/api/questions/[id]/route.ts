import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { QuizzesService } from '@/lib/quizzes/service';
import { updateQuestionSchema } from '@/lib/quizzes/schemas';

export const runtime = 'nodejs';

export const PATCH = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, updateQuestionSchema);
  const svc = new QuizzesService(prisma);
  return NextResponse.json(
    await svc.updateQuestion(params.id, body, { userId: user.id, role: user.role }),
  );
});

export const DELETE = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new QuizzesService(prisma);
  await svc.removeQuestion(params.id, { userId: user.id, role: user.role });
  return new NextResponse(null, { status: 204 });
});
