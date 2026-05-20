import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { MaterialsService } from '@/lib/materials/service';

export const runtime = 'nodejs';

/**
 * GET /api/materials/:id/download
 *
 * Returns a short-lived (10 min) presigned URL. The client redirects/links
 * to it for the actual download. We don't proxy the bytes — that would
 * blow through Vercel's response-time + bandwidth limits.
 */
export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new MaterialsService(prisma);
  return NextResponse.json(
    await svc.getDownloadUrl(params.id, { userId: user.id, role: user.role }),
  );
});
