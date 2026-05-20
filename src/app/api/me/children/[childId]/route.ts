import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { ParentLinksService } from '@/lib/parent-links/service';

export const runtime = 'nodejs';

/** GET /api/me/children/:childId — profile summary of one approved child. */
export const GET = route<{ childId: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };
  await new ParentLinksService(prisma).assertParentOf(params.childId, ctx);

  const child = await prisma.user.findUnique({
    where: { id: params.childId },
    select: {
      id: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      phone: true,
      studentProfile: {
        select: { schoolName: true, gradeLevel: true, dateOfBirth: true },
      },
    },
  });
  if (!child) throw ApiError.notFound('Child not found');
  return NextResponse.json(child);
});
