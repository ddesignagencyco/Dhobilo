// Defaults for e2e runs against the docker-compose Postgres/Redis (npm run test:e2e). CI can override any of these.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://dhoblio:dhoblio@localhost:5432/dhoblio?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret',
  ENC_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  HMAC_KEY_BASE64: Buffer.alloc(32, 9).toString('base64'),
  OTP_BYPASS: 'true',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
