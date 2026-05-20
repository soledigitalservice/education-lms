import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { GradesService } from '@/lib/grades/service';

export const runtime = 'nodejs';

/** GET /api/me/grades — all grades for the current user (student). */
export const GET = route(async () => {
  const user = await requireSession();
  const svc = new GradesService(prisma);
  return NextResponse.json(
    await svc.listForStudent(user.id, { userId: user.id, role: user.role }),
  );
});
