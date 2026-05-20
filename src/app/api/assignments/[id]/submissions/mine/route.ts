import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { SubmissionsService } from '@/lib/submissions/service';

export const runtime = 'nodejs';

/**
 * GET /api/assignments/:id/submissions/mine
 * Returns the current student's draft (creating it if needed).
 */
export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new SubmissionsService(prisma);
  return NextResponse.json(
    await svc.getOrCreateDraft(params.id, { userId: user.id, role: user.role }),
  );
});
