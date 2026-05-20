import * as argon2 from 'argon2';

/**
 * Password hashing using Argon2id with parameters recommended by OWASP (2023).
 *   - memoryCost  : 19 MiB
 *   - timeCost    : 2 iterations
 *   - parallelism : 1 thread
 *
 * These parameters target ~50ms per hash on commodity hardware — slow enough
 * to make offline brute-force expensive, fast enough not to harm UX.
 */
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // verify() throws on malformed hashes; treat as "not matched".
    return false;
  }
}

/**
 * Constant-time-ish dummy hash used in login to equalise timing when the
 * user does NOT exist — prevents email enumeration by timing.
 */
export async function dummyVerify(): Promise<void> {
  try {
    await argon2.hash('dummy-password-for-timing-equalization', ARGON2_OPTS);
  } catch {
    // Ignore — this is only a timing shield, never returns to the user.
  }
}
