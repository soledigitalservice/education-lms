import type { NextRequest } from 'next/server';

import { ApiError } from './errors';

/**
 * Simple in-memory rate limiter.
 *
 * Trade-offs (intentional for v1):
 *   - Memory is per-instance, so multiple Node processes don't share state.
 *     Acceptable while running a single Next.js server. When we add a
 *     horizontally-scaled deployment (Capa 7+, Redis is in the stack),
 *     this can be swapped for a Redis-backed limiter without touching callers.
 *   - Pruning is lazy (on access), not via a sweeper — bounded by `limit`.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Unique identifier for the limit (e.g. 'auth:login'). */
  key: string;
  /** Window length in ms (e.g. 60_000 = 1 minute). */
  windowMs: number;
  /** Max requests per window per IP. */
  max: number;
}

/**
 * Enforce a rate limit for the given request. Throws ApiError(429) when exceeded.
 * Caller passes a stable `key` that identifies the protected endpoint.
 */
export function enforceRateLimit(req: NextRequest, opts: RateLimitOptions): void {
  const ip = extractIp(req);
  const bucketKey = `${opts.key}:${ip}`;
  const now = Date.now();
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + opts.windowMs });
    return;
  }
  if (existing.count >= opts.max) {
    const retryInSec = Math.ceil((existing.resetAt - now) / 1000);
    throw ApiError.tooManyRequests(
      `Too many requests. Try again in ${retryInSec}s.`,
    );
  }
  existing.count += 1;
}

function extractIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? 'unknown';
  return req.headers.get('x-real-ip') ?? req.ip ?? 'unknown';
}

/** Test-only: clear all buckets (used by Vitest setup/teardown). */
export function _resetRateLimitForTests(): void {
  buckets.clear();
}
