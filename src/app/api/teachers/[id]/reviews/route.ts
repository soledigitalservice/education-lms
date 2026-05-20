import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { TeacherReviewsService } from '@/lib/teacher-reviews/service';
import { upsertReviewSchema } from '@/lib/teacher-reviews/schemas';

export const runtime = 'nodejs';

/** GET /api/teachers/:id/reviews — public summary + list. Auth required (any role). */
export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  await requireSession();
  const svc = new TeacherReviewsService(prisma);
  return NextResponse.json(await svc.listForTeacher(params.id));
});

/** PUT /api/teachers/:id/reviews — upsert the current user's review. */
export const PUT = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, upsertReviewSchema);
  const svc = new TeacherReviewsService(prisma);
  return NextResponse.json(
    await svc.upsert(params.id, body, { userId: user.id, role: user.role }),
  );
});
