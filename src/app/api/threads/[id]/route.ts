import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ForumsService } from '@/lib/forums/service';
import { moderateThreadSchema } from '@/lib/forums/schemas';

export const runtime = 'nodejs';

export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new ForumsService(prisma);
  return NextResponse.json(
    await svc.getThread(params.id, { userId: user.id, role: user.role }),
  );
});

/** PATCH — pin/lock moderation. */
export const PATCH = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, moderateThreadSchema);
  const svc = new ForumsService(prisma);
  return NextResponse.json(
    await svc.moderateThread(params.id, body, { userId: user.id, role: user.role }),
  );
});

export const DELETE = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new ForumsService(prisma);
  await svc.deleteThread(params.id, { userId: user.id, role: user.role });
  return new NextResponse(null, { status: 204 });
});
