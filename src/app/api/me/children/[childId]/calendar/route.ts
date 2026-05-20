import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CalendarService } from '@/lib/calendar/service';
import { calendarQuerySchema } from '@/lib/calendar/schemas';

export const runtime = 'nodejs';

export const GET = route<{ childId: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const q = readQuery(req, calendarQuerySchema);
  const svc = new CalendarService(prisma);
  return NextResponse.json(
    await svc.eventsForChild(params.childId, q, { userId: user.id, role: user.role }),
  );
});
