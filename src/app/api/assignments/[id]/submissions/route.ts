import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { Roles } from '@/lib/rbac/roles';
import { SubmissionsService } from '@/lib/submissions/service';

export const runtime = 'nodejs';

/**
 * GET — TEACHER/ADMIN list all submissions for an assignment.
 * STUDENT calls /api/assignments/:id/submissions/mine instead.
 */
export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new SubmissionsService(prisma);
  if (user.role === Roles.STUDENT) {
    // Convenience redirect: students get their own submission via this list endpoint too.
    return NextResponse.json(
      [await svc.getOrCreateDraft(params.id, { userId: user.id, role: user.role })],
    );
  }
  return NextResponse.json(
    await svc.listForAssignment(params.id, { userId: user.id, role: user.role }),
  );
});
