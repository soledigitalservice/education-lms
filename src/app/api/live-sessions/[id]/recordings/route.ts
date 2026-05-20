import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { RecordingsService } from '@/lib/recordings/service';

export const runtime = 'nodejs';

export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new RecordingsService(prisma);
  return NextResponse.json(
    await svc.listForSession(params.id, { userId: user.id, role: user.role }),
  );
});

export const POST = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new RecordingsService(prisma);
  return NextResponse.json(
    await svc.startForSession(params.id, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});
