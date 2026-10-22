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
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', OTP_BYPASS: 'true' })).toThrow(/OTP_BYPASS/);
  });

  it('allows OTP_BYPASS=false in production', () => {
    expect(validateEnv({ ...base, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });

  it('rejects short JWT secrets and missing required values', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects encryption keys that are not 32 bytes', () => {
    expect(() => validateEnv({ ...base, ENC_KEY_BASE64: Buffer.alloc(16).toString('base64') })).toThrow(/ENC_KEY_BASE64/);
  });
});
