import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { LessonsService } from '@/lib/lessons/service';
import { createLessonSchema } from '@/lib/lessons/schemas';

export const runtime = 'nodejs';

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireSession();
  const svc = new LessonsService(prisma);
  return NextResponse.json(
    await svc.listForModule(params.id, { userId: user.id, role: user.role }),
  );
});

export const POST = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, createLessonSchema);
  const svc = new LessonsService(prisma);
  return NextResponse.json(
    await svc.create(params.id, body, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});
