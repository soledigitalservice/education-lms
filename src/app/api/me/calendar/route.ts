import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CalendarService } from '@/lib/calendar/service';
import { calendarQuerySchema } from '@/lib/calendar/schemas';

export const runtime = 'nodejs';

export const GET = route(async (req: NextRequest) => {
  const user = await requireSession();
  const q = readQuery(req, calendarQuerySchema);
  const svc = new CalendarService(prisma);
  return NextResponse.json(await svc.eventsForUser(user.id, user.role, q));
});
