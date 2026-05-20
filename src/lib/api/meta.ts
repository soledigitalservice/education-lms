import type { NextRequest } from 'next/server';

import type { RequestMeta } from '../auth/service';

/** Extract user-agent + best-effort IP from a request — for audit/logging. */
export function extractRequestMeta(req: NextRequest): RequestMeta {
  const userAgent = req.headers.get('user-agent') ?? undefined;
  const fwd = req.headers.get('x-forwarded-for');
  const ipAddress =
    (fwd ? fwd.split(',')[0]?.trim() : undefined) ??
    req.headers.get('x-real-ip') ??
    req.ip ??
    undefined;
  return { userAgent, ipAddress };
}
