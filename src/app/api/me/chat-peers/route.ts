import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ChatService } from '@/lib/chat/service';

export const runtime = 'nodejs';

/**
 * GET /api/me/chat-peers
 * Returns the user-list the caller is allowed to start a 1-1 chat with,
 * filtered by enrollment / parent-link relationships.
 */
export const GET = route(async () => {
  const user = await requireSession();
  const svc = new ChatService(prisma);
  return NextResponse.json(
    await svc.listChatablePeers({ userId: user.id, role: user.role }),
  );
});
