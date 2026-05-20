import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ParentLinksService } from '@/lib/parent-links/service';

export const runtime = 'nodejs';

/** DELETE = revoke (parent or admin only). */
export const DELETE = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new ParentLinksService(prisma);
  return NextResponse.json(
    await svc.revoke(params.id, { userId: user.id, role: user.role }),
  );
});
