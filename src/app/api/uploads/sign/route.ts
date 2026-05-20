import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { readJson } from '@/lib/api/validate';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { requireSession } from '@/lib/auth/session';
import { isStorageConfigured } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { Roles } from '@/lib/rbac/roles';
import { UploadsService } from '@/lib/uploads/service';
import { signUploadSchema } from '@/lib/uploads/schemas';

export const runtime = 'nodejs';

/**
 * POST /api/uploads/sign
 *
 * Authenticated users only. We don't gate by role here — the consuming
 * endpoint (assignment attachment, submission file, material…) re-checks
 * that the user is allowed to ATTACH the resulting fileId to the target
 * resource. That way students can upload submission files and avatars,
 * teachers can upload course materials and assignment attachments, etc.
 *
 * Rate-limited to avoid abuse: 20 sign requests / 60s / user.
 */
export const POST = route(async (req: NextRequest) => {
  const user = await requireSession();
  if (user.role === Roles.PARENT) {
    // Parents don't upload anything in v1.
    throw ApiError.forbidden('Parent accounts cannot upload files');
  }

  if (!isStorageConfigured()) {
    throw ApiError.badRequest(
      'Object storage is not configured on this deployment. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY in your .env. See README → "Cloudflare R2 setup".',
    );
  }

  enforceRateLimit(req, { key: 'uploads:sign', windowMs: 60_000, max: 20 });

  const body = await readJson(req, signUploadSchema);
  const svc = new UploadsService({ prisma, uploaderId: user.id });
  return NextResponse.json(await svc.signUpload(body));
});
