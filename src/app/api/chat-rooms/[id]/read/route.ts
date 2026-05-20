import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ChatService } from '@/lib/chat/service';
import { emitRead } from '@/lib/chat/io';
import { markReadSchema } from '@/lib/chat/schemas';

export const runtime = 'nodejs';

export const PUT = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, markReadSchema);
  const svc = new ChatService(prisma);
  await svc.markRead(params.id, body.messageId, { userId: user.id, role: user.role });
  emitRead(params.id, user.id, body.messageId);
  return new NextResponse(null, { status: 204 });
});
