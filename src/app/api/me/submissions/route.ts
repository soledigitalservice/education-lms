import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { SubmissionsService } from '@/lib/submissions/service';

export const runtime = 'nodejs';

/** GET /api/me/submissions — student's own submissions. */
export const GET = route(async () => {
  const user = await requireSession();
  const svc = new SubmissionsService(prisma);
  return NextResponse.json(
    await svc.listMine({ userId: user.id, role: user.role }),
  );
});
