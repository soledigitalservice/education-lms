import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ParentLinksService } from '@/lib/parent-links/service';
import { requestLinkSchema } from '@/lib/parent-links/schemas';

export const runtime = 'nodejs';

/** POST /api/parent-links — parent requests a link to a student email. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireSession();
  const body = await readJson(req, requestLinkSchema);
  const svc = new ParentLinksService(prisma);
  return NextResponse.json(
    await svc.request(body, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});
