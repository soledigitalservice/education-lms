import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ParentLinksService } from '@/lib/parent-links/service';
import { decideLinkSchema } from '@/lib/parent-links/schemas';

export const runtime = 'nodejs';

export const PATCH = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, decideLinkSchema).catch(() => ({}));
  const svc = new ParentLinksService(prisma);
  return NextResponse.json(
    await svc.reject(params.id, body, { userId: user.id, role: user.role }),
  );
});
