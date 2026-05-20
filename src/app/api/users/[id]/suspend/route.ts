import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { UsersService } from '@/lib/users/service';
import { updateStatusSchema } from '@/lib/users/schemas';
import { Roles } from '@/lib/rbac/roles';

export const runtime = 'nodejs';

export const PATCH = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const admin = await requireRole(Roles.ADMIN);
  const body = await readJson(req, updateStatusSchema);
  const users = new UsersService(prisma);
  return NextResponse.json(await users.suspend(params.id, admin.id, body.reason));
});
