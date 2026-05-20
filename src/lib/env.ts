import { z } from 'zod';

/**
 * Single source of truth for environment configuration.
 * Validated at module load — if anything is missing the process fails fast
 * with a readable error rather than crashing later at first use.
 *
 * Add new variables in three places: the zod schema below, the parsed
 * export, and `.env.example`.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(10, 'DATABASE_URL is required'),
  DIRECT_DATABASE_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 chars (generate with: openssl rand -base64 64)'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@education-lms.local'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),
  SEED_ADMIN_NAME: z.string().default('Platform Admin'),

  // ---- S3-compatible object storage (Capa 3) ----
  // Treated as all-or-nothing — if any S3_* is set, all must be set.
  // Validated below via .refine() so the error message is one clear line.
  S3_ENDPOINT: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional().or(z.literal('').transform(() => undefined)),
  S3_ACCESS_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  S3_SECRET_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  /// Optional public URL prefix (e.g. R2 custom domain). When not set, downloads use presigned GET URLs.
  S3_PUBLIC_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),

  // ---- LiveKit (Capa 7) ----
  // All-or-nothing. The URL is the LiveKit signal endpoint (wss:// in prod).
  LIVEKIT_URL: z
    .string()
    .regex(/^wss?:\/\//, 'LIVEKIT_URL must start with ws:// or wss://')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  LIVEKIT_API_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  LIVEKIT_API_SECRET: z.string().optional().or(z.literal('').transform(() => undefined)),

  // ---- Notifications (Capa 9) ----
  // Email via Resend. Both required together.
  RESEND_API_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  EMAIL_FROM: z
    .string()
    .email('EMAIL_FROM must be a valid email like "Education LMS <no-reply@yourdomain.com>" — quoted name + bare email also works')
    .optional()
    .or(z.literal('').transform(() => undefined)),

  // Web Push via VAPID. All three required together. Subject is contact info
  // (mailto: or https://) that push services use to reach you for abuse reports.
  VAPID_PUBLIC_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  VAPID_PRIVATE_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https?:\/\/)/, 'VAPID_SUBJECT must start with mailto: or https://')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  /// Public mirror exposed to the browser so the SW can subscribe.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
})
  .refine(
    (e) => {
      const fields = [e.S3_ENDPOINT, e.S3_BUCKET, e.S3_ACCESS_KEY, e.S3_SECRET_KEY];
      const set = fields.filter(Boolean).length;
      return set === 0 || set === 4;
    },
    {
      message:
        'Object storage env vars must be set together: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY (S3_REGION defaults to "auto").',
      path: ['S3_BUCKET'],
    },
  )
  .refine(
    (e) => {
      const fields = [e.LIVEKIT_URL, e.LIVEKIT_API_KEY, e.LIVEKIT_API_SECRET];
      const set = fields.filter(Boolean).length;
      return set === 0 || set === 3;
    },
    {
      message:
        'LiveKit env vars must be set together: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET. See README → "LiveKit setup".',
      path: ['LIVEKIT_URL'],
    },
  )
  .refine(
    (e) => {
      const fields = [e.RESEND_API_KEY, e.EMAIL_FROM];
      const set = fields.filter(Boolean).length;
      return set === 0 || set === 2;
    },
    {
      message: 'Email env vars must be set together: RESEND_API_KEY and EMAIL_FROM. See README → "Notifications setup".',
      path: ['RESEND_API_KEY'],
    },
  )
  .refine(
    (e) => {
      const fields = [
        e.VAPID_PUBLIC_KEY,
        e.VAPID_PRIVATE_KEY,
        e.VAPID_SUBJECT,
        e.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      ];
      const set = fields.filter(Boolean).length;
      // Either zero (push disabled) or all four. The two VAPID public keys
      // must also be equal — but that's checked separately for a clearer error.
      return set === 0 || set === 4;
    },
    {
      message:
        'Web Push env vars must be set together: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY. Generate with: npx web-push generate-vapid-keys',
      path: ['VAPID_PUBLIC_KEY'],
    },
  )
  .refine(
    (e) => {
      if (!e.VAPID_PUBLIC_KEY && !e.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return true;
      return e.VAPID_PUBLIC_KEY === e.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    },
    {
      message: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY must equal VAPID_PUBLIC_KEY (they are mirrors).',
      path: ['NEXT_PUBLIC_VAPID_PUBLIC_KEY'],
    },
  );

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error('\n❌ Invalid environment configuration:\n' + issues + '\n');
  throw new Error('Environment validation failed. See errors above.');
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;

/** True when all S3 credentials are present and uploads are enabled. */
export function isStorageConfigured(): boolean {
  return Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY && env.S3_SECRET_KEY);
}

/** True when LiveKit is configured and live video features are enabled. */
export function isLiveKitConfigured(): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}

/** True when transactional email is configured (Resend). */
export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

/** True when Web Push is configured (VAPID keys). */
export function isPushConfigured(): boolean {
  return Boolean(
    env.VAPID_PUBLIC_KEY &&
      env.VAPID_PRIVATE_KEY &&
      env.VAPID_SUBJECT &&
      env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  );
}
