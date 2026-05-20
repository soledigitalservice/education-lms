import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { AdminStatsService } from '@/lib/admin-stats/service';
import { Roles } from '@/lib/rbac/roles';

export const runtime = 'nodejs';

export const GET = route(async () => {
  await requireRole(Roles.ADMIN);
  const svc = new AdminStatsService(prisma);
  return NextResponse.json(await svc.overview());
});
