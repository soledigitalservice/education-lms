import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ScheduleEventsService } from '@/lib/schedule-events/service';
import { createScheduleEventSchema } from '@/lib/schedule-events/schemas';

export const runtime = 'nodejs';

export const POST = route(async (req: NextRequest) => {
  const user = await requireSession();
  const body = await readJson(req, createScheduleEventSchema);
  const svc = new ScheduleEventsService(prisma);
  return NextResponse.json(
    await svc.create(body, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});
