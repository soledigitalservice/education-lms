import { cache } from 'react';

import { prisma } from '../prisma';
import { readAccessCookie } from './cookies';
import { verifyAccessToken } from './tokens';
import type { Role } from '../rbac/roles';
import type { Permission } from '../rbac/permissions';
import { AccountStatus } from '../rbac/roles';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'REJECTED' | 'SUSPENDED';
  avatarUrl: string | null;
  phone: string | null;
  permissions: Permission[];
}

/**
 * Read the current session from the request cookies.
 *
 * Returns null if there's no valid session — does NOT throw. Use
 * `requireSession()` / `requireRole()` from server components / route handlers
 * to enforce authentication.
 *
 * Wrapped in React's `cache` so multiple calls in the same request
 * (layout, page, server actions) share one DB roundtrip.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = readAccessCookie();
  if (!token) return null;

  let claims: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    return null;
  }

  // Re-hydrate from DB so suspended/deleted accounts can't use a still-valid token.
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      avatarUrl: true,
      phone: true,
      deletedAt: true,
    },
  });
  if (!user || user.deletedAt) return null;
  if (user.status !== AccountStatus.ACTIVE) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    permissions: claims.permissions,
  };
});

/** Throw a typed error if the user is not authenticated. */
export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) {
    throw Object.assign(new Error('Not authenticated'), { status: 401 });
  }
  return s;
}

/** Throw a typed error if the user is not one of the allowed roles. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const s = await requireSession();
  if (!roles.includes(s.role)) {
    throw Object.assign(
      new Error(`Requires one of [${roles.join(', ')}], you are ${s.role}`),
      { status: 403 },
    );
  }
  return s;
}
