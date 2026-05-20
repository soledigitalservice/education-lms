import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ScheduleEventsService } from '@/lib/schedule-events/service';

export const runtime = 'nodejs';

export const GET = route(async () => {
  const user = await requireSession();
  const svc = new ScheduleEventsService(prisma);
  return NextResponse.json(await svc.listMine({ userId: user.id, role: user.role }));
});
