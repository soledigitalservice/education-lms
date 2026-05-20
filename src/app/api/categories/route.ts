import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireRole, requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CategoriesService } from '@/lib/categories/service';
import { createCategorySchema } from '@/lib/categories/schemas';
import { Roles } from '@/lib/rbac/roles';

export const runtime = 'nodejs';

/**
 * GET /api/categories?tree=1
 *   - Public to any authenticated user (used by the catalog filter)
 *   - tree=1 returns a hierarchical structure; otherwise a flat list.
 */
export const GET = route(async (req: NextRequest) => {
  await requireSession();
  const svc = new CategoriesService(prisma);
  const wantTree = req.nextUrl.searchParams.get('tree') === '1';
  return NextResponse.json(wantTree ? await svc.listTree() : await svc.listFlat());
});

/** POST /api/categories — admin-only. */
export const POST = route(async (req: NextRequest) => {
  await requireRole(Roles.ADMIN);
  const body = await readJson(req, createCategorySchema);
  const svc = new CategoriesService(prisma);
  return NextResponse.json(await svc.create(body), { status: 201 });
});
