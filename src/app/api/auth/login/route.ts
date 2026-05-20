import { NextRequest, NextResponse } from 'next/server';

import { AuthService } from '@/lib/auth/service';
import { setAuthCookies } from '@/lib/auth/cookies';
import { loginSchema } from '@/lib/auth/schemas';
import { prisma } from '@/lib/prisma';
import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { extractRequestMeta } from '@/lib/api/meta';

export const runtime = 'nodejs';

export const POST = route(async (req: NextRequest) => {
  enforceRateLimit(req, { key: 'auth:login', windowMs: 60_000, max: 10 });

  const { email, password } = await readJson(req, loginSchema);
  const auth = new AuthService(prisma);
  const result = await auth.login(email, password, extractRequestMeta(req));

  setAuthCookies(result.accessToken, result.refreshToken);
  return NextResponse.json(result);
});
