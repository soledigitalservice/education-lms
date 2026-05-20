import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { AssignmentsService } from '@/lib/assignments/service';
import { updateAssignmentSchema } from '@/lib/assignments/schemas';

export const runtime = 'nodejs';

export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new AssignmentsService(prisma);
  return NextResponse.json(
    await svc.getById(params.id, { userId: user.id, role: user.role }),
  );
});

export const PATCH = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, updateAssignmentSchema);
  const svc = new AssignmentsService(prisma);
  return NextResponse.json(
    await svc.update(params.id, body, { userId: user.id, role: user.role }),
  );
});

export const DELETE = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new AssignmentsService(prisma);
  await svc.remove(params.id, { userId: user.id, role: user.role });
  return new NextResponse(null, { status: 204 });
});
