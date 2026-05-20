import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { NotificationsService } from '@/lib/notifications/service';

export const runtime = 'nodejs';

export const PATCH = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new NotificationsService(prisma);
  await svc.markRead(params.id, user.id, user.role);
  return new NextResponse(null, { status: 204 });
});
