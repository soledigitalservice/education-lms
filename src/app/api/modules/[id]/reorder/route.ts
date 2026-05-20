import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ModulesService } from '@/lib/modules/service';
import { reorderSchema } from '@/lib/modules/schemas';

export const runtime = 'nodejs';

export const POST = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, reorderSchema);
  const svc = new ModulesService(prisma);
  await svc.reorder(params.id, body, { userId: user.id, role: user.role });
  return new NextResponse(null, { status: 204 });
});
