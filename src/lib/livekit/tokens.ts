import { AccessToken } from 'livekit-server-sdk';

import { env, isLiveKitConfigured } from '../env';

export interface AccessTokenOptions {
  /** Stable LiveKit identity for this user — we use the DB user id. */
  identity: string;
  /** Display name shown in the participant list. */
  displayName: string;
  /** Room name as stored in LiveSession.roomName. */
  roomName: string;
  /** Hosts can publish; participants subscribe-only by default. */
  isHost: boolean;
  /** Token TTL — default 1h (enough for a class; we re-issue on rejoin). */
  ttlSec?: number;
}

/**
 * Build a LiveKit JWT for the browser to join the room.
 *
 * Permission rules:
 *   - host: full publish (cam+mic+screen-share) + data channel publish
 *   - participant: subscribe-only + may publish data (so they can react,
 *     e.g. emoji reactions later) but NOT a/v tracks.
 *
 * Rooms are auto-created by the LiveKit server on first publisher join,
 * so we don't need to pre-create them from the API.
 */
export async function buildAccessToken(opts: AccessTokenOptions): Promise<string> {
  if (!isLiveKitConfigured()) {
    throw new Error('LiveKit not configured');
  }
  const at = new AccessToken(env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!, {
    identity: opts.identity,
    name: opts.displayName,
    ttl: opts.ttlSec ?? 60 * 60,
  });
  at.addGrant({
    roomJoin: true,
    room: opts.roomName,
    canPublish: opts.isHost,
    canPublishData: true, // both roles can use data channels (chat/raise-hand)
    canSubscribe: true,
    ...(opts.isHost
      ? {
          // canPublishSources is the recommended limit; if omitted defaults to all.
          // We list them explicitly for documentation purposes.
          canPublishSources: ['camera', 'microphone', 'screen_share', 'screen_share_audio'] as never,
          roomAdmin: true, // host can mute/unmute/remove participants via DataChannel actions
        }
      : {}),
  });
  return at.toJwt();
}
