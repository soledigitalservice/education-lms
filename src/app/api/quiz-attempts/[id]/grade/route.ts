import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { GradesService } from '@/lib/grades/service';
import { upsertGradeSchema } from '@/lib/grades/schemas';

export const runtime = 'nodejs';

/**
 * PUT /api/quiz-attempts/:id/grade — teacher manually scores a quiz attempt
 * (used for LONG_ANSWER questions and adjustments to auto-graded score).
 */
export const PUT = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, upsertGradeSchema);
  const svc = new GradesService(prisma);
  return NextResponse.json(
    await svc.upsertForQuizAttempt(params.id, body, { userId: user.id, role: user.role }),
  );
});
