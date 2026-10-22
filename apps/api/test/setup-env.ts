import { E2E_DATABASE_URL, E2E_REDIS_URL } from './e2e-env';

// e2e always runs against the dedicated test database and Redis db 1, whatever DATABASE_URL/REDIS_URL say.
process.env.DATABASE_URL = E2E_DATABASE_URL;
process.env.REDIS_URL = E2E_REDIS_URL;

// Defaults for everything else; CI can override any of these.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret',
  ENC_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  HMAC_KEY_BASE64: Buffer.alloc(32, 9).toString('base64'),
  OTP_BYPASS: 'true',
  // Lets tests choose the client IP via X-Forwarded-For (per-IP rate limits).
  TRUST_PROXY: '1',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  // Fake Cloudinary credentials: enough to sign uploads; network calls are stubbed in tests that need them.
  CLOUDINARY_CLOUD_NAME: 'demo',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
  CLOUDINARY_UPLOAD_PRESET: 'test-preset',
  COURIER_MOCK_WEBHOOK_SECRET: 'test-courier-secret',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
