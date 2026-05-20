import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { NotificationsService } from '@/lib/notifications/service';

export const runtime = 'nodejs';

export const GET = route(async () => {
  const user = await requireSession();
  const svc = new NotificationsService(prisma);
  return NextResponse.json({ unreadCount: await svc.unreadCountForUser(user.id) });
});
