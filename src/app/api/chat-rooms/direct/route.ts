import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ChatService } from '@/lib/chat/service';
import { createDirectSchema } from '@/lib/chat/schemas';

export const runtime = 'nodejs';

/** Find-or-create a DIRECT chat room with another user. Idempotent. */
export const POST = route(async (req: NextRequest) => {
  const user = await requireSession();
  const body = await readJson(req, createDirectSchema);
  const svc = new ChatService(prisma);
  return NextResponse.json(
    await svc.createDirect(body.otherUserId, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});
