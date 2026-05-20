import { WebhookReceiver } from 'livekit-server-sdk';

import { env, isLiveKitConfigured } from '../env';

/**
 * LiveKit webhook receiver. Verifies the JWT in the `Authorization` header
 * was signed with our API secret, so we can trust the payload (room events,
 * egress events, etc.).
 */
let cachedReceiver: WebhookReceiver | null = null;

export function getWebhookReceiver(): WebhookReceiver {
  if (!isLiveKitConfigured()) {
    throw new Error('LiveKit not configured');
  }
  if (cachedReceiver) return cachedReceiver;
  cachedReceiver = new WebhookReceiver(env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!);
  return cachedReceiver;
}
