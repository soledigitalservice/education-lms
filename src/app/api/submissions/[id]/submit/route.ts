import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { SubmissionsService } from '@/lib/submissions/service';
import { submitSubmissionSchema } from '@/lib/submissions/schemas';

export const runtime = 'nodejs';

export const POST = route<{ id: string }>(async (req: NextRequest, { params }) => {
  const user = await requireSession();
  const body = await readJson(req, submitSubmissionSchema).catch(() => ({}));
  const svc = new SubmissionsService(prisma);
  return NextResponse.json(
    await svc.submit(params.id, body, { userId: user.id, role: user.role }),
  );
});
