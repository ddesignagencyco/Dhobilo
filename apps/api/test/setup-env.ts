import { E2E_DATABASE_URL, E2E_REDIS_URL } from './e2e-env';

// e2e always runs against the dedicated test database and Redis db 1, whatever DATABASE_URL/REDIS_URL say.
process.env.DATABASE_URL = E2E_DATABASE_URL;
process.env.REDIS_URL = E2E_REDIS_URL;

/*
 * Forced, not defaulted: the per-IP rate-limit tests choose their client with X-Forwarded-For, which
 * Express only honours when `trust proxy` is set, and `configureApp` sets it only when TRUST_PROXY > 0.
 *
 * This cannot go in `defaults` below, because the repo-root .env ships `TRUST_PROXY=0` (correct for a
 * local server with no proxy in front of it) and that value reaches the jest worker. The guard there is
 * `if (!process.env[key])`, and the string "0" is truthy, so the default never applied: every request
 * looked like 127.0.0.1, so the tests asserting "a different IP is unaffected" saw one shared counter and
 * failed. CI never hit it because CI has no .env file.
 */
process.env.TRUST_PROXY = '1';

// Defaults for everything else; CI (or a shell) can override any of these with a non-empty value.
// Empty values count as unset so a local .env with blank placeholders cannot break the e2e suite.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  // The CORS/CSRF tests assert against these exact origins. Set them here so a local .env pointing at
  // another web port (3001) cannot make an otherwise-green e2e suite fail; a shell/CI value still wins.
  APP_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret',
  ENC_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  HMAC_KEY_BASE64: Buffer.alloc(32, 9).toString('base64'),
  OTP_BYPASS: 'true',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  // Fake Cloudinary credentials: enough to sign uploads; network calls are stubbed in tests that need them.
  CLOUDINARY_CLOUD_NAME: 'demo',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: 'test-secret',
  CLOUDINARY_UPLOAD_PRESET: 'test-preset',
  COURIER_MOCK_WEBHOOK_SECRET: 'test-courier-secret',
  PAYMENTS_MODE: 'mock',
  PAYMENT_MOCK_WEBHOOK_SECRET: 'test-payment-secret',
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value;
}
