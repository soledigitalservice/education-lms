import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';

import { env } from '../env';
import { permissionsFor, type Permission } from '../rbac/permissions';
import type { Role } from '../rbac/roles';

const ACCESS_KEY = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessTokenClaims {
  sub: string; // user id
  email: string;
  role: Role;
  permissions: Permission[];
  iat?: number;
  exp?: number;
}

/** Sign a short-lived access JWT. */
export async function signAccessToken(user: {
  id: string;
  email: string;
  role: Role;
}): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + parseTtlToMs(env.JWT_ACCESS_TTL));
  const token = await new SignJWT({
    email: user.email,
    role: user.role,
    permissions: [...permissionsFor(user.role)],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt.getTime() / 1000)
    .sign(ACCESS_KEY);

  return { token, expiresAt };
}

/** Verify and decode an access JWT. Throws if invalid or expired. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, ACCESS_KEY, { algorithms: ['HS256'] });
  // jose returns JWTPayload (loose typing) — narrow it.
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Malformed access token');
  }
  return payload as unknown as AccessTokenClaims;
}

// ---- Refresh tokens (opaque, stored as SHA-256 in the DB) --------------

export interface NewRefreshToken {
  token: string; // opaque, sent to the client
  tokenHash: string; // SHA-256, persisted in DB
  expiresAt: Date;
}

export function generateRefreshToken(): NewRefreshToken {
  const token = randomBytes(48).toString('base64url');
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(Date.now() + parseTtlToMs(env.JWT_REFRESH_TTL));
  return { token, tokenHash, expiresAt };
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Parse a TTL like "15m" / "7d" / "3600" → milliseconds.
 * Throws on malformed input so misconfig fails at startup.
 */
export function parseTtlToMs(ttl: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(ttl.trim());
  if (!match) throw new Error(`Invalid TTL value: "${ttl}"`);
  const n = Number(match[1]);
  const unit = match[2] ?? 's';
  const mult: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * (mult[unit] ?? 1_000);
}
