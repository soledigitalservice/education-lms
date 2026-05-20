import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { EnrollmentsService } from '@/lib/enrollments/service';
import { decideEnrollmentSchema } from '@/lib/enrollments/schemas';

export const runtime = 'nodejs';

/** Teacher removes an active student from a course. */
export const DELETE = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, decideEnrollmentSchema).catch(() => ({ reason: undefined }));
  const enrollments = new EnrollmentsService(prisma);
  return NextResponse.json(
    await enrollments.remove(params.id, body.reason, { userId: user.id, role: user.role }),
  );
});
