import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { EnrollmentsService } from '@/lib/enrollments/service';
import { ParentLinksService } from '@/lib/parent-links/service';

export const runtime = 'nodejs';

/** GET — parent's view of a single child's enrollments. */
export const GET = route<{ childId: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };
  await new ParentLinksService(prisma).assertParentOf(params.childId, ctx);
  return NextResponse.json(
    await new EnrollmentsService(prisma).listForStudent(params.childId),
  );
});
