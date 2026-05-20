import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { RecordingsService } from '@/lib/recordings/service';

export const runtime = 'nodejs';

export const POST = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new RecordingsService(prisma);
  await svc.stopForSession(params.id, { userId: user.id, role: user.role });
  return new NextResponse(null, { status: 204 });
});
