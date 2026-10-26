import { validateEnv } from './env';

const key32 = Buffer.alloc(32, 1).toString('base64');
const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  ENC_KEY_BASE64: key32,
  HMAC_KEY_BASE64: key32,
};

describe('validateEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = validateEnv({ ...base, PORT: '5000', OTP_BYPASS: 'true' });
    expect(env.PORT).toBe(5000);
    expect(env.OTP_BYPASS).toBe(true);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.BULL_BOARD_ENABLED).toBe(false);
  });

  it('defaults the Cloudinary root folder and rejects unsafe values', () => {
    expect(validateEnv(base).CLOUDINARY_FOLDER_ROOT).toBe('dhoblio');
    expect(validateEnv({ ...base, CLOUDINARY_FOLDER_ROOT: 'apps/dhoblio' }).CLOUDINARY_FOLDER_ROOT).toBe('apps/dhoblio');
    for (const bad of ['', '../caresaath', '/dhoblio', 'dhoblio/', 'a b', 'a//b']) {
      expect(() => validateEnv({ ...base, CLOUDINARY_FOLDER_ROOT: bad })).toThrow(/CLOUDINARY_FOLDER_ROOT/);
    }
  });

  it('refuses OTP_BYPASS=true in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', PAYMENTS_MODE: 'live', OTP_BYPASS: 'true' })).toThrow(
      /OTP_BYPASS/,
    );
  });

  it('allows OTP_BYPASS=false in production', () => {
    expect(validateEnv({ ...base, NODE_ENV: 'production', PAYMENTS_MODE: 'live', CORS_ORIGINS: 'https://app.dhoblio.pk' }).NODE_ENV).toBe('production');
  });

  it('needs exact https origins for CORS in production, never a wildcard', () => {
    const prod = { ...base, NODE_ENV: 'production', PAYMENTS_MODE: 'live' };
    for (const bad of [undefined, '', '*', 'https://*.dhoblio.pk', 'http://app.dhoblio.pk', 'https://a.pk,*']) {
      expect(() => validateEnv({ ...prod, ...(bad === undefined ? {} : { CORS_ORIGINS: bad }) })).toThrow(/CORS_ORIGINS/);
    }
    expect(validateEnv({ ...prod, CORS_ORIGINS: 'https://app.dhoblio.pk, https://admin.dhoblio.pk' }).NODE_ENV).toBe('production');
    expect(() => validateEnv({ ...base, NODE_ENV: 'development' })).not.toThrow(); // local development keeps its relaxed default
  });

  it('has safe defaults for rate limits, the database pool and shutdown', () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({ RATE_LIMIT_DEFAULT_PER_MIN: 600, DB_POOL_SIZE: 10, DB_POOL_TIMEOUT_SEC: 10, SHUTDOWN_DRAIN_MS: 0, RETENTION_OTP_DAYS: 2, RETENTION_NOTIFICATION_DAYS: 180 });
    expect(() => validateEnv({ ...base, DB_POOL_SIZE: '0' })).toThrow(/DB_POOL_SIZE/);
    expect(() => validateEnv({ ...base, RETENTION_NOTIFICATION_DAYS: '3' })).toThrow(/RETENTION_NOTIFICATION_DAYS/);
  });

  it('refuses mock payments in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', PAYMENTS_MODE: 'mock' })).toThrow(/PAYMENTS_MODE/);
  });

  it('rejects short JWT secrets and missing required values', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects encryption keys that are not 32 bytes', () => {
    expect(() => validateEnv({ ...base, ENC_KEY_BASE64: Buffer.alloc(16).toString('base64') })).toThrow(/ENC_KEY_BASE64/);
  });
});
