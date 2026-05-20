import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { UsersService } from '@/lib/users/service';
import { Roles } from '@/lib/rbac/roles';

export const runtime = 'nodejs';

export const PATCH = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const admin = await requireRole(Roles.ADMIN);
  const users = new UsersService(prisma);
  return NextResponse.json(await users.reactivate(params.id, admin.id));
});
