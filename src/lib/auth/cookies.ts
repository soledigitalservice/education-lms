import { cookies } from 'next/headers';

import { env } from '../env';
import { parseTtlToMs } from './tokens';

export const ACCESS_COOKIE = 'edu_access';
export const REFRESH_COOKIE = 'edu_refresh';

const isProd = env.NODE_ENV === 'production';

/**
 * Standard cookie options for both access and refresh cookies.
 *   - httpOnly  : not accessible from JS (XSS shield).
 *   - sameSite  : 'lax' allows top-level navigation, blocks cross-site POST.
 *   - secure    : HTTPS only in production.
 *   - path '/'  : sent on every same-origin request.
 */
function baseOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}

export function setAuthCookies(accessToken: string, refreshToken: string): void {
  const accessMaxAge = Math.floor(parseTtlToMs(env.JWT_ACCESS_TTL) / 1000);
  const refreshMaxAge = Math.floor(parseTtlToMs(env.JWT_REFRESH_TTL) / 1000);
  const jar = cookies();
  jar.set(ACCESS_COOKIE, accessToken, baseOptions(accessMaxAge));
  jar.set(REFRESH_COOKIE, refreshToken, baseOptions(refreshMaxAge));
}

export function clearAuthCookies(): void {
  const jar = cookies();
  jar.set(ACCESS_COOKIE, '', { ...baseOptions(0), maxAge: 0 });
  jar.set(REFRESH_COOKIE, '', { ...baseOptions(0), maxAge: 0 });
}

export function readAccessCookie(): string | undefined {
  return cookies().get(ACCESS_COOKIE)?.value;
}

export function readRefreshCookie(): string | undefined {
  return cookies().get(REFRESH_COOKIE)?.value;
}
