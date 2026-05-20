import { NextRequest, NextResponse } from 'next/server';

import { AuthService } from '@/lib/auth/service';
import { clearAuthCookies, readRefreshCookie } from '@/lib/auth/cookies';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { route } from '@/lib/api/handler';

export const runtime = 'nodejs';

export const POST = route(async (_req: NextRequest) => {
  const user = await requireSession();
  const auth = new AuthService(prisma);
  await auth.logout(user.id, readRefreshCookie());
  clearAuthCookies();
  return new NextResponse(null, { status: 204 });
});
