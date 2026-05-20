import { EgressClient, RoomServiceClient } from 'livekit-server-sdk';

import { env, isLiveKitConfigured } from '../env';

/**
 * LiveKit admin clients (Room API and Egress API). Lazy singletons so apps
 * that don't enable live video don't pay the import cost at boot.
 *
 * The Room API URL is the *HTTP* endpoint, which LiveKit exposes by
 * deriving from the signal URL (replace ws/wss with http/https).
 */
let cachedRoom: RoomServiceClient | null = null;
let cachedEgress: EgressClient | null = null;

function httpUrlFromSignal(signalUrl: string): string {
  return signalUrl.replace(/^ws/, 'http');
}

function requireLiveKit(): { url: string; key: string; secret: string } {
  if (!isLiveKitConfigured()) {
    throw new Error(
      'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in your .env. See README → "LiveKit setup".',
    );
  }
  return {
    url: httpUrlFromSignal(env.LIVEKIT_URL!),
    key: env.LIVEKIT_API_KEY!,
    secret: env.LIVEKIT_API_SECRET!,
  };
}

export function getRoomClient(): RoomServiceClient {
  if (cachedRoom) return cachedRoom;
  const { url, key, secret } = requireLiveKit();
  cachedRoom = new RoomServiceClient(url, key, secret);
  return cachedRoom;
}

export function getEgressClient(): EgressClient {
  if (cachedEgress) return cachedEgress;
  const { url, key, secret } = requireLiveKit();
  cachedEgress = new EgressClient(url, key, secret);
  return cachedEgress;
}

/** The signal URL the browser connects to. Exposed to the client via the token endpoint. */
export function getPublicSignalUrl(): string {
  if (!env.LIVEKIT_URL) {
    throw new Error('LIVEKIT_URL not configured');
  }
  return env.LIVEKIT_URL;
}
