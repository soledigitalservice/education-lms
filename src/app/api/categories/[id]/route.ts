import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireRole } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CategoriesService } from '@/lib/categories/service';
import { updateCategorySchema } from '@/lib/categories/schemas';
import { Roles } from '@/lib/rbac/roles';

export const runtime = 'nodejs';

export const PATCH = route<{ id: string }>(async (req: NextRequest, { params }) => {
  await requireRole(Roles.ADMIN);
  const body = await readJson(req, updateCategorySchema);
  const svc = new CategoriesService(prisma);
  return NextResponse.json(await svc.update(params.id, body));
});

export const DELETE = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  await requireRole(Roles.ADMIN);
  const svc = new CategoriesService(prisma);
  await svc.remove(params.id);
  return new NextResponse(null, { status: 204 });
});
