import { notFound } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { LiveSessionsService } from '@/lib/live-sessions/service';
import { MaterialsService } from '@/lib/materials/service';
import { ApiError } from '@/lib/api/errors';
import { isLiveKitConfigured } from '@/lib/env';
import { Card, CardTitle } from '@/components/ui/card';
import { LiveRoom } from './live-room';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { slug: string; sessionId: string };
}

export default async function LiveSessionPage({ params }: PageProps) {
  const user = await requireSession();
  const ctx = { userId: user.id, role: user.role };

  const svc = new LiveSessionsService(prisma);
  let session;
  try {
    session = await svc.getById(params.sessionId, ctx);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  if (!isLiveKitConfigured()) {
    return (
      <Card>
        <CardTitle>Video en vivo no configurado</CardTitle>
        <p className="mt-3 text-sm text-slate-500">
          El administrador no ha configurado LiveKit en este despliegue. Pídele que añada{' '}
          <code>LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code> y <code>LIVEKIT_API_SECRET</code>{' '}
          al <code>.env</code>. Ver README → &quot;LiveKit setup&quot;.
        </p>
      </Card>
    );
  }

  // Pre-load course materials so the host's "show this material" picker is
  // populated without an extra round-trip after the room is joined.
  const materials = await new MaterialsService(prisma).listForCourse(session.courseId, ctx);

  return (
    <LiveRoom
      session={session}
      materials={materials}
      currentUserId={user.id}
      currentUserName={user.fullName}
    />
  );
}
