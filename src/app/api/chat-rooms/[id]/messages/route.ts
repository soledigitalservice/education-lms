import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson, readQuery } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ChatService } from '@/lib/chat/service';
import { emitMessage } from '@/lib/chat/io';
import { listMessagesQuerySchema, sendMessageSchema } from '@/lib/chat/schemas';

export const runtime = 'nodejs';

export const GET = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const q = readQuery(req, listMessagesQuerySchema);
  const svc = new ChatService(prisma);
  return NextResponse.json(
    await svc.listMessages(params.id, q, { userId: user.id, role: user.role }),
  );
});

/**
 * HTTP send (alternative path to the WebSocket). Used by mobile clients
 * that haven't established a socket, or as a degradation fallback. The
 * server still emits via Socket.IO so connected listeners get the message.
 */
export const POST = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, sendMessageSchema);
  const svc = new ChatService(prisma);
  const msg = await svc.sendMessage(params.id, body, { userId: user.id, role: user.role });
  emitMessage(params.id, msg);
  return NextResponse.json(msg, { status: 201 });
});
