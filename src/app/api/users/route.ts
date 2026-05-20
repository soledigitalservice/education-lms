import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readQuery } from '@/lib/api/validate';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { UsersService } from '@/lib/users/service';
import { listUsersQuerySchema } from '@/lib/users/schemas';
import { Roles } from '@/lib/rbac/roles';

export const runtime = 'nodejs';

export const GET = route(async (req: NextRequest) => {
  await requireRole(Roles.ADMIN);
  const filter = readQuery(req, listUsersQuerySchema);
  const users = new UsersService(prisma);
  return NextResponse.json(await users.list(filter));
});
