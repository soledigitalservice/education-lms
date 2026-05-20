import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { AdminStatsService } from '@/lib/admin-stats/service';
import { Roles } from '@/lib/rbac/roles';

export const runtime = 'nodejs';

export const GET = route(async (req: NextRequest) => {
  await requireRole(Roles.ADMIN);
  const limit = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10), 1),
    200,
  );
  const svc = new AdminStatsService(prisma);
  return NextResponse.json(await svc.activityFeed(limit));
});
