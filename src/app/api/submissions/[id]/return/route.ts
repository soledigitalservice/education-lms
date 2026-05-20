import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { SubmissionsService } from '@/lib/submissions/service';

export const runtime = 'nodejs';

/** Teacher returns a submitted submission to the student for revision. */
export const POST = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new SubmissionsService(prisma);
  return NextResponse.json(
    await svc.returnForRevision(params.id, { userId: user.id, role: user.role }),
  );
});
