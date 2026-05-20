import { NextResponse } from 'next/server';

import { route } from '@/lib/api/handler';
import { isPushConfigured } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * Exposes the VAPID public key to the browser so the Service Worker can
 * `pushManager.subscribe({applicationServerKey: <this>, userVisibleOnly: true})`.
 * Returns 503 when push isn't configured so the FE renders a clean fallback.
 */
export const GET = route(async () => {
  if (!isPushConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }
  return NextResponse.json({
    configured: true,
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
});
