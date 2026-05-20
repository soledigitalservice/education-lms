import { NextRequest, NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { isLiveKitConfigured } from '@/lib/env';
import { getWebhookReceiver } from '@/lib/livekit/webhook';
import { prisma } from '@/lib/prisma';
import { RecordingsService } from '@/lib/recordings/service';

export const runtime = 'nodejs';

/**
 * Webhook LiveKit posts to whenever an event happens (recording finished,
 * room ended, etc.). Public from the app's perspective — we authenticate
 * the request via the JWT in the `Authorization` header, signed with our
 * LIVEKIT_API_SECRET. Calling `requireSession()` here would be wrong:
 * LiveKit doesn't have our user cookies.
 *
 * In dev, point ngrok at port 3000 and set the LiveKit project webhook to
 *   https://<your-ngrok>.ngrok-free.app/api/livekit/webhook
 */
export const POST = route(async (req: NextRequest) => {
  if (!isLiveKitConfigured()) {
    return new NextResponse('not configured', { status: 503 });
  }
  const receiver = getWebhookReceiver();
  const body = await req.text();
  const auth = req.headers.get('authorization') ?? '';
  // Throws if the JWT signature doesn't match our secret → wrapper returns 500
  // which is acceptable behaviour for an authenticated webhook source.
  const event = await receiver.receive(body, auth);

  if (event.event === 'egress_ended' && event.egressInfo) {
    const info = event.egressInfo;
    const s3Key = info.fileResults?.[0]?.filename ?? info.file?.filename ?? null;
    const durationSec =
      info.endedAt && info.startedAt
        ? Math.floor(Number(BigInt(info.endedAt) - BigInt(info.startedAt)) / 1_000_000_000)
        : null;
    const failed = info.status === 4 /* EGRESS_FAILED */ || Boolean(info.error && info.error.length > 0);
    await new RecordingsService(prisma).handleEgressEnded({
      egressId: info.egressId,
      s3Key,
      durationSec,
      failed,
      failureReason: info.error,
    });
  }
  // Other events (room_started, room_finished, participant_*) are ignored
  // for v1. Add handlers here when we need presence audit logs.
  return NextResponse.json({ ok: true });
});
