import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { LiveSessionsService } from '@/lib/live-sessions/service';

export const runtime = 'nodejs';

export const POST = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new LiveSessionsService(prisma);
  return NextResponse.json(
    await svc.markEnded(params.id, { userId: user.id, role: user.role }),
  );
});
