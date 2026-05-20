import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { RecordingsService } from '@/lib/recordings/service';

export const runtime = 'nodejs';

/** GET — recordings of all courses my child is enrolled in. */
export const GET = route<{ childId: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new RecordingsService(prisma);
  return NextResponse.json(
    await svc.listForChild(params.childId, { userId: user.id, role: user.role }),
  );
});
