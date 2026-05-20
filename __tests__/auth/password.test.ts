import { describe, expect, it } from 'vitest';
import { dummyVerify, hashPassword, verifyPassword } from '@/lib/auth/password';

describe('password hashing', () => {
  it('hashes a password and verifies it round-trips', async () => {
    const hash = await hashPassword('SuperSecret123!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'SuperSecret123!')).resolves.toBe(true);
  });

  it('returns false for a wrong password', async () => {
    const hash = await hashPassword('CorrectPassword99');
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('verifyPassword returns false (does not throw) on a malformed hash', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('dummyVerify resolves and does not throw', async () => {
    await expect(dummyVerify()).resolves.toBeUndefined();
  });
});
