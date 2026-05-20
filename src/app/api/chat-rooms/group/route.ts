import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ChatService } from '@/lib/chat/service';
import { createGroupSchema } from '@/lib/chat/schemas';

export const runtime = 'nodejs';

export const POST = route(async (req: NextRequest) => {
  const user = await requireSession();
  const body = await readJson(req, createGroupSchema);
  const svc = new ChatService(prisma);
  return NextResponse.json(
    await svc.createGroup(body, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});
