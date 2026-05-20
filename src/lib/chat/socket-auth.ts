import { parse as parseCookie } from 'node:querystring';

import { ACCESS_COOKIE } from '../auth/cookies';
import { verifyAccessToken } from '../auth/tokens';
import { prisma } from '../prisma';
import { AccountStatus } from '../rbac/roles';
import type { SocketData } from './events';

/**
 * Pulls the access token out of a raw `Cookie` header without depending on
 * the next/headers cookies() (which only works in App Router contexts).
 * Used inside the Socket.IO handshake before any Next handler has run.
 */
function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const piece of cookieHeader.split(/;\s*/)) {
    const eq = piece.indexOf('=');
    if (eq < 0) continue;
    if (decodeURIComponent(piece.slice(0, eq).trim()) === name) {
      return decodeURIComponent(piece.slice(eq + 1));
    }
  }
  return undefined;
}

/**
 * Resolve the authenticated user behind a socket handshake. Throws if the
 * token is missing/invalid/expired or the account is not ACTIVE.
 */
export async function authenticateHandshake(cookieHeader: string | undefined): Promise<SocketData> {
  const token = readCookie(cookieHeader, ACCESS_COOKIE);
  if (!token) throw new Error('No access token cookie');

  const claims = await verifyAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, role: true, status: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new Error('User does not exist');
  if (user.status !== AccountStatus.ACTIVE) throw new Error(`Account is ${user.status}`);

  return { userId: user.id, email: user.email, role: user.role as SocketData['role'] };
}

/** Silence the unused `parseCookie` import when tree-shaken. */
void parseCookie;
