import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { readJson } from '@/lib/api/validate';
import { requireSession } from '@/lib/auth/session';
import { isPushConfigured } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/api/errors';
import {
  PushSubscriptionsService,
  registerSubscriptionSchema,
} from '@/lib/push/subscriptions-service';

export const runtime = 'nodejs';

export const POST = route(async (req: NextRequest) => {
  const user = await requireSession();
  if (!isPushConfigured()) {
    throw ApiError.badRequest('Web Push is not configured on this deployment');
  }
  const body = await readJson(req, registerSubscriptionSchema);
  const svc = new PushSubscriptionsService(prisma);
  return NextResponse.json(await svc.register(body, user.id), { status: 201 });
});
