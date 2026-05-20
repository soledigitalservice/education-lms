import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/session';
import { route } from '@/lib/api/handler';

export const runtime = 'nodejs';

/**
 * GET /api/auth/me
 *   - 200 { user, permissions } if session is valid
 *   - 200 { user: null }        if no session (so the FE can render guests
 *                                without treating it as an error)
 */
export const GET = route(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: session.id,
      email: session.email,
      fullName: session.fullName,
      role: session.role,
      status: session.status,
      avatarUrl: session.avatarUrl,
      phone: session.phone,
    },
    permissions: session.permissions,
  });
});
