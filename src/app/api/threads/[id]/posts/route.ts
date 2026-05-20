import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ForumsService } from '@/lib/forums/service';
import { createPostSchema } from '@/lib/forums/schemas';

export const runtime = 'nodejs';

export const POST = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, createPostSchema);
  const svc = new ForumsService(prisma);
  return NextResponse.json(
    await svc.createPost(params.id, body, { userId: user.id, role: user.role }),
    { status: 201 },
  );
});
