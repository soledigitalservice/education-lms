import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { UploadsService } from '@/lib/uploads/service';

export const runtime = 'nodejs';

/**
 * GET /api/uploads/:id/url
 *
 * Caller MUST already have read permission on the file (enforced by the
 * route that linked to this URL — typically a material download endpoint).
 * This endpoint exists as a low-level helper for admin/dev tooling; the
 * primary file-access path goes through /api/materials/:id/download which
 * checks enrollment.
 */
export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  await requireSession();
  const svc = new UploadsService({ prisma, uploaderId: 'unused' });
  return NextResponse.json(await svc.getDownloadUrl(params.id));
});
