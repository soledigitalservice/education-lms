import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { GradesService } from '@/lib/grades/service';
import { ParentLinksService } from '@/lib/parent-links/service';

export const runtime = 'nodejs';

/** GET — parent's view of a single child's grades. */
export const GET = route<{ childId: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };
  // Parent-link check runs once here; the GradesService also enforces it,
  // but doing it at the route gives a cleaner 403 before any DB work.
  await new ParentLinksService(prisma).assertParentOf(params.childId, ctx);
  return NextResponse.json(
    await new GradesService(prisma).listForStudent(params.childId, ctx),
  );
});
