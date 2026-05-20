import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { EnrollmentsService } from '@/lib/enrollments/service';

export const runtime = 'nodejs';

/** GET /api/me/enrollments — current student's enrollments. */
export const GET = route(async () => {
  const user = await requireSession();
  const svc = new EnrollmentsService(prisma);
  return NextResponse.json(await svc.listForStudent(user.id));
});
