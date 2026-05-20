import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/handler';
import { readQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { NotificationsService } from '@/lib/notifications/service';

export const runtime = 'nodejs';

const querySchema = z.object({
  unread: z.enum(['1', 'true']).optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = route(async (req: NextRequest) => {
  const user = await requireSession();
  const q = readQuery(req, querySchema);
  const svc = new NotificationsService(prisma);
  return NextResponse.json(
    await svc.listForUser(user.id, {
      unreadOnly: Boolean(q.unread),
      cursor: q.cursor,
      limit: q.limit,
    }),
  );
});
