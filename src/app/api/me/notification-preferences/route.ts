import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { NotificationPreferencesService } from '@/lib/notification-preferences/service';
import { bulkUpsertSchema } from '@/lib/notification-preferences/schemas';

export const runtime = 'nodejs';

/** GET — full matrix (every kind × every channel) with defaults filled. */
export const GET = route(async () => {
  const user = await requireSession();
  const svc = new NotificationPreferencesService(prisma);
  return NextResponse.json(await svc.listForUser(user.id));
});

/** PUT — bulk replace the user's preferences. */
export const PUT = route(async (req: NextRequest) => {
  const user = await requireSession();
  const body = await readJson(req, bulkUpsertSchema);
  const svc = new NotificationPreferencesService(prisma);
  await svc.bulkUpsert(user.id, body);
  return NextResponse.json(await svc.listForUser(user.id));
});
