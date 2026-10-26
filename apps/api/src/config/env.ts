import { z } from 'zod';
import { parseKeyList } from '../common/crypto/field-crypto';

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    APP_URL: z.string().url().default('http://localhost:3000'),
    API_URL: z.string().url().default('http://localhost:4000'),
    CORS_ORIGINS: z.string().optional(),
    /** Number of reverse-proxy hops to trust for client IP (rate limits, audit). 0 = trust none. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^\d+[smhd]$/, 'JWT_ACCESS_TTL must look like 15m, 1h, 900s or 1d')
      .default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

    OTP_BYPASS: bool.default(false),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),

    ENC_KEY_ID: z.string().min(1).default('k1'),
    ENC_KEY_BASE64: z.string().min(1),
    /** Retired keys still needed to read old ciphertext: "k0=<base64>,k-1=<base64>". */
    ENC_PREVIOUS_KEYS: z.string().optional(),
    HMAC_KEY_BASE64: z.string().min(1),

    CLOUDINARY_CLOUD_NAME: z.string().default(''),
    CLOUDINARY_API_KEY: z.string().default(''),
    CLOUDINARY_API_SECRET: z.string().default(''),
    CLOUDINARY_UPLOAD_PRESET: z.string().default(''),
    /** Top-level Cloudinary folder for everything Dhoblio stores (kept apart from other apps on the same account). */
    CLOUDINARY_FOLDER_ROOT: z
      .string()
      .regex(/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/, 'CLOUDINARY_FOLDER_ROOT must be a plain folder path like dhoblio')
      .default('dhoblio'),

    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
    SMTP_FROM: z.string().default('Dhoblio <no-reply@dhoblio.pk>'),

    SMS_PROVIDER: z.string().default('mock'),
    SMS_API_KEY: z.string().default(''),
    WHATSAPP_PROVIDER: z.string().default('mock'),
    WHATSAPP_TOKEN: z.string().default(''),

    PUSH_PROVIDER: z.enum(['mock', 'fcm']).default('mock'),
    FCM_PROJECT_ID: z.string().default(''),
    FCM_CLIENT_EMAIL: z.string().default(''),
    FCM_PRIVATE_KEY: z.string().default(''),

    GOOGLE_MAPS_API_KEY: z.string().default(''),

    /** Delivery and dispatch (Phase 5). Fees are what a rider earns per completed leg, in PKR. */
    RIDER_FEE_PICKUP_PKR: z.coerce.number().min(0).default(80),
    RIDER_FEE_DROP_PKR: z.coerce.number().min(0).default(120),
    /** Auto-dispatch starts this many minutes before a job's scheduled window opens. */
    DISPATCH_LEAD_MIN: z.coerce.number().int().min(0).default(60),
    /** How long a rider has to accept an offered job before it goes to the next one. */
    DISPATCH_OFFER_TIMEOUT_SEC: z.coerce.number().int().min(5).default(90),
    /** Search rounds (each widens the radius, then repeats the last) before ops is alerted. */
    DISPATCH_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(8),
    DISPATCH_RETRY_SEC: z.coerce.number().int().min(1).default(30),
    /** A rider counts as reachable only if they pinged within this many seconds. */
    RIDER_HEARTBEAT_TTL_SEC: z.coerce.number().int().min(10).default(120),
    RIDER_MAX_ACTIVE_JOBS: z.coerce.number().int().min(1).default(3),
    /** Customers can see the rider's live position once the rider is on the way. */
    RIDER_TRACKING_ENABLED: bool.default(true),
    DELIVERY_OTP_TTL_HOURS: z.coerce.number().int().min(1).default(24),
    DELIVERY_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    /** Where to email when a job cannot be assigned to anyone (optional). */
    OPS_ALERT_EMAIL: z.string().default(''),
    /** Shared secret the mock courier partner signs its webhooks with (testing). */
    COURIER_MOCK_WEBHOOK_SECRET: z.string().default(''),

    /** Referral rewards (Phase 7): a personal one-time promo for the referrer. */
    REFERRAL_REWARD_PKR: z.coerce.number().min(0).default(100),
    REFERRAL_REWARD_VALID_DAYS: z.coerce.number().int().min(1).default(90),

    /** Online payments (Phase 6). `mock` returns a stand-in checkout and accepts signed test webhooks. */
    PAYMENTS_MODE: z.enum(['mock', 'live']).default('mock'),
    /** How long a customer has to finish an online payment before the order is cancelled. */
    PAYMENT_TIMEOUT_MIN: z.coerce.number().int().min(1).default(10),
    /** How often the worker asks gateways about payments whose webhook never arrived. */
    PAYMENT_RECONCILE_INTERVAL_SEC: z.coerce.number().int().min(30).default(600),
    /** Signs mock gateway webhooks (HMAC-SHA256 of the raw body). */
    PAYMENT_MOCK_WEBHOOK_SECRET: z.string().default(''),
    JAZZCASH_MERCHANT_ID: z.string().default(''),
    JAZZCASH_PASSWORD: z.string().default(''),
    JAZZCASH_INTEGRITY_SALT: z.string().default(''),
    JAZZCASH_API_URL: z.string().default(''),
    JAZZCASH_RETURN_URL: z.string().default(''),
    EASYPAISA_STORE_ID: z.string().default(''),
    EASYPAISA_HASH_KEY: z.string().default(''),
    EASYPAISA_API_URL: z.string().default(''),
    EASYPAISA_RETURN_URL: z.string().default(''),
    PAYFAST_MERCHANT_ID: z.string().default(''),
    PAYFAST_SECURE_KEY: z.string().default(''),
    PAYFAST_API_URL: z.string().default(''),
    PAYFAST_RETURN_URL: z.string().default(''),
    RAAST_MERCHANT_ID: z.string().default(''),
    RAAST_SECRET_KEY: z.string().default(''),
    RAAST_API_URL: z.string().default(''),
    RAAST_RETURN_URL: z.string().default(''),

    /** Backstop for every route, per signed-in user (or IP when signed out), per minute. 0 turns it off. */
    RATE_LIMIT_DEFAULT_PER_MIN: z.coerce.number().int().min(0).default(600),

    /** Postgres connections this process may open (Prisma pool). Size: replicas x this <= max_connections x 0.8. */
    DB_POOL_SIZE: z.coerce.number().int().min(1).max(200).default(10),
    /** How long a query waits for a free pool connection before failing. */
    DB_POOL_TIMEOUT_SEC: z.coerce.number().int().min(1).default(10),
    /** On SIGTERM the API reports "not ready" for this long before it stops, so the load balancer drains it first. */
    SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).default(0),

    /** Queue watch (Phase 9): alert when failed jobs or a backlog build up. */
    QUEUE_ALERT_FAILED: z.coerce.number().int().min(1).default(10),
    QUEUE_ALERT_WAITING: z.coerce.number().int().min(1).default(1000),
    /** A job that has been "active" this long is probably stuck. */
    QUEUE_ALERT_STUCK_MIN: z.coerce.number().int().min(1).default(15),
    QUEUE_ALERT_COOLDOWN_MIN: z.coerce.number().int().min(1).default(60),

    /** Retention (days): how long operational records are kept before the nightly clean-up removes them. */
    RETENTION_OTP_DAYS: z.coerce.number().int().min(1).default(2),
    RETENTION_SESSION_DAYS: z.coerce.number().int().min(1).default(30),
    RETENTION_NOTIFICATION_DAYS: z.coerce.number().int().min(7).default(180),
    RETENTION_WEBHOOK_EVENT_DAYS: z.coerce.number().int().min(7).default(90),

    BULL_BOARD_ENABLED: bool.default(false),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.OTP_BYPASS) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_BYPASS'],
        message: 'OTP_BYPASS must not be true in production',
      });
    }
    if (env.NODE_ENV === 'production') {
      const origins = (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
      if (origins.length === 0 || origins.some((o) => o === '*' || !/^https:\/\/[^*\s]+$/.test(o))) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'CORS_ORIGINS must list the exact https:// origins allowed in production (no wildcard)',
        });
      }
    }
    if (env.NODE_ENV === 'production' && env.PAYMENTS_MODE === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENTS_MODE'],
        message: 'PAYMENTS_MODE must be live in production',
      });
    }
    if (env.PUSH_PROVIDER === 'fcm') {
      for (const key of ['FCM_PROJECT_ID', 'FCM_CLIENT_EMAIL', 'FCM_PRIVATE_KEY'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when PUSH_PROVIDER=fcm` });
      }
    }
    if (!/^[A-Za-z0-9_-]+$/.test(env.ENC_KEY_ID)) {
      ctx.addIssue({ code: 'custom', path: ['ENC_KEY_ID'], message: 'ENC_KEY_ID may only contain letters, digits, _ and -' });
    }
    try {
      parseKeyList(env.ENC_PREVIOUS_KEYS);
    } catch (err) {
      ctx.addIssue({ code: 'custom', path: ['ENC_PREVIOUS_KEYS'], message: (err as Error).message });
    }
    for (const key of ['ENC_KEY_BASE64', 'HMAC_KEY_BASE64'] as const) {
      if (Buffer.from(env[key], 'base64').length !== 32) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must be 32 bytes, base64-encoded`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Used as the `validate` hook of @nestjs/config; throws (and so aborts boot) on any invalid value. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
