import { NextRequest, NextResponse } from 'next/server';

import { AuthService } from '@/lib/auth/service';
import { readRefreshCookie, setAuthCookies } from '@/lib/auth/cookies';
import { refreshSchema } from '@/lib/auth/schemas';
import { prisma } from '@/lib/prisma';
import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { extractRequestMeta } from '@/lib/api/meta';
import { ApiError } from '@/lib/api/errors';

export const runtime = 'nodejs';

export const POST = route(async (req: NextRequest) => {
  enforceRateLimit(req, { key: 'auth:refresh', windowMs: 60_000, max: 30 });

  // Web clients send the refresh token in the httpOnly cookie.
  // Mobile / non-browser clients pass it in the body.
  const body = await readJson(req, refreshSchema);
  const token = body.refreshToken ?? readRefreshCookie();
  if (!token) throw ApiError.unauthorized('No refresh token provided');

  const auth = new AuthService(prisma);
  const result = await auth.refresh(token, extractRequestMeta(req));

  setAuthCookies(result.accessToken, result.refreshToken);
  return NextResponse.json(result);
});
