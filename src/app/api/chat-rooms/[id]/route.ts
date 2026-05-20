import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ChatService } from '@/lib/chat/service';

export const runtime = 'nodejs';

export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new ChatService(prisma);
  return NextResponse.json(
    await svc.getRoom(params.id, { userId: user.id, role: user.role }),
  );
});
