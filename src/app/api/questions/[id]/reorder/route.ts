import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { QuizzesService } from '@/lib/quizzes/service';
import { reorderQuestionSchema } from '@/lib/quizzes/schemas';

export const runtime = 'nodejs';

export const POST = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, reorderQuestionSchema);
  const svc = new QuizzesService(prisma);
  await svc.reorderQuestion(params.id, body, { userId: user.id, role: user.role });
  return new NextResponse(null, { status: 204 });
});
