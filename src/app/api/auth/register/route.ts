import { NextResponse } from 'next/server';

import { ApiError, toErrorResponse } from '@/lib/api/errors';

export const runtime = 'nodejs';

/**
 * Public account creation is disabled. Only administrators create users,
 * via POST /api/admin/users.
 */
export function POST(): NextResponse {
  return toErrorResponse(
    new ApiError(403, 'Forbidden', 'Public registration is disabled. Ask an administrator.'),
    '/api/auth/register',
  );
}
