import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { SubmissionsService } from '@/lib/submissions/service';
import { draftSubmissionSchema } from '@/lib/submissions/schemas';

export const runtime = 'nodejs';

export const GET = route<{ id: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const svc = new SubmissionsService(prisma);
  return NextResponse.json(
    await svc.getById(params.id, { userId: user.id, role: user.role }),
  );
});

/** Save draft (notes + add files). */
export const PATCH = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, draftSubmissionSchema);
  const svc = new SubmissionsService(prisma);
  return NextResponse.json(
    await svc.upsertDraft(params.id, body, { userId: user.id, role: user.role }),
  );
});
