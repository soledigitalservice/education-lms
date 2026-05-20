import { describe, expect, it, beforeAll } from 'vitest';

// Required env BEFORE importing the module under test (env.ts validates at load).
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
});

describe('access tokens', () => {
  it('signs and verifies an access JWT, including permissions for the role', async () => {
    const { signAccessToken, verifyAccessToken } = await import('@/lib/auth/tokens');
    const { token } = await signAccessToken({
      id: 'usr_1',
      email: 'foo@bar.com',
      role: 'TEACHER',
    });
    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe('usr_1');
    expect(claims.email).toBe('foo@bar.com');
    expect(claims.role).toBe('TEACHER');
    expect(claims.permissions).toContain('course.create');
  });

  it('rejects a tampered token', async () => {
    const { signAccessToken, verifyAccessToken } = await import('@/lib/auth/tokens');
    const { token } = await signAccessToken({
      id: 'usr_1',
      email: 'foo@bar.com',
      role: 'STUDENT',
    });
    const tampered = token.slice(0, -2) + (token.slice(-2) === 'aa' ? 'bb' : 'aa');
    await expect(verifyAccessToken(tampered)).rejects.toBeTruthy();
  });
});

describe('refresh tokens', () => {
  it('generates an opaque token and a matching SHA-256 hash', async () => {
    const { generateRefreshToken, hashOpaqueToken } = await import('@/lib/auth/tokens');
    const { token, tokenHash, expiresAt } = generateRefreshToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(tokenHash).toHaveLength(64); // sha256 hex
    expect(hashOpaqueToken(token)).toBe(tokenHash);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('parseTtlToMs', () => {
  it('parses common TTL formats', async () => {
    const { parseTtlToMs } = await import('@/lib/auth/tokens');
    expect(parseTtlToMs('15m')).toBe(15 * 60 * 1000);
    expect(parseTtlToMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseTtlToMs('1h')).toBe(60 * 60 * 1000);
    expect(parseTtlToMs('3600')).toBe(3600 * 1000);
  });

  it('throws on malformed input', async () => {
    const { parseTtlToMs } = await import('@/lib/auth/tokens');
    expect(() => parseTtlToMs('forever')).toThrow();
    expect(() => parseTtlToMs('')).toThrow();
  });
});
