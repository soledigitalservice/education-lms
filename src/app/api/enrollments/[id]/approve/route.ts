import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { EnrollmentsService } from '@/lib/enrollments/service';

export const runtime = 'nodejs';

export const PATCH = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const enrollments = new EnrollmentsService(prisma);
  return NextResponse.json(
    await enrollments.approve(params.id, { userId: user.id, role: user.role }),
  );
});
