import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { PushSubscriptionsService } from '@/lib/push/subscriptions-service';

export const runtime = 'nodejs';

/**
 * DELETE — pass the URL-encoded endpoint as the [endpointId] segment.
 * (Endpoints are URLs themselves; encodeURIComponent before calling.)
 */
export const DELETE = route<{ endpointId: string }>(async (_req: NextRequest, { params }) => {
  const user = await requireSession();
  const endpoint = decodeURIComponent(params.endpointId);
  const svc = new PushSubscriptionsService(prisma);
  await svc.unregister(endpoint, user.id);
  return new NextResponse(null, { status: 204 });
});
