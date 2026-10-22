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

    FCM_PROJECT_ID: z.string().default(''),
    FCM_CLIENT_EMAIL: z.string().default(''),
    FCM_PRIVATE_KEY: z.string().default(''),

    GOOGLE_MAPS_API_KEY: z.string().default(''),

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
