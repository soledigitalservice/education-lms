import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ParentLinksService } from '@/lib/parent-links/service';

export const runtime = 'nodejs';

/** GET /api/me/parent-links — links the caller participates in (as parent or child). */
export const GET = route(async () => {
  const user = await requireSession();
  const svc = new ParentLinksService(prisma);
  return NextResponse.json(
    await svc.listMine({ userId: user.id, role: user.role }),
  );
});
