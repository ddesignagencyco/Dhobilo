import * as argon2 from 'argon2';
import request from 'supertest';
import { hashOtp, otpKey } from '../src/modules/auth/otp.service';
import { TestApp, clearRateLimits, createTestApp, otpLogin, randomPhone } from './helpers';

describe('Auth (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const createdPhones: string[] = [];
  const adminEmails: string[] = [];

  const phone = () => {
    const p = randomPhone();
    createdPhones.push(p);
    return p;
  };

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });

  beforeEach(() => clearRateLimits(t.redis));

  afterAll(async () => {
    await t.prisma.user.deleteMany({
      where: { OR: [{ phone: { in: createdPhones } }, { email: { in: adminEmails } }] },
    });
    await t.prisma.otpCode.deleteMany({ where: { phone: { in: createdPhones } } });
    await t.close();
  });

  describe('OTP request', () => {
    it('rejects numbers that are not Pakistani mobiles', async () => {
      const res = await http.post('/api/v1/auth/otp/request').send({ phone: '+15551234567' }).expect(400);
      expect(res.body.error.code).toBe('INVALID_PHONE');
    });

    it('accepts local formats and stores the code hashed with a TTL', async () => {
      const p = phone();
      const local = '0' + p.slice(3);
      const res = await http.post('/api/v1/auth/otp/request').send({ phone: local }).expect(200);
      expect(res.body.data.expiresInSeconds).toBe(300);

      const stored = await t.redis.hgetall(otpKey(p));
      expect(stored.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.values(stored)).not.toContain('123456');
      expect(await t.redis.ttl(otpKey(p))).toBeGreaterThan(290);
      expect(await t.prisma.otpCode.count({ where: { phone: p } })).toBe(1);
    });

    it('allows 3 requests per phone per 10 minutes, then 429s', async () => {
      const p = phone();
      for (let i = 0; i < 3; i++) await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
      const res = await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(res.body.error.details.retryAfterSec).toBeGreaterThan(0);
    });

    it('allows 10 requests per IP per hour across different phones', async () => {
      const ip = '203.0.113.7';
      for (let i = 0; i < 10; i++) {
        await http.post('/api/v1/auth/otp/request').set('x-forwarded-for', ip).send({ phone: phone() }).expect(200);
      }
      await http.post('/api/v1/auth/otp/request').set('x-forwarded-for', ip).send({ phone: phone() }).expect(429);
      // A different client is unaffected.
      await http.post('/api/v1/auth/otp/request').set('x-forwarded-for', '203.0.113.8').send({ phone: phone() }).expect(200);
    });
  });

  describe('OTP verify', () => {
    it('creates a customer with a referral code on first login, then reuses the account', async () => {
      const p = phone();
      const first = await otpLogin(http, p);
      expect(first.body.data).toMatchObject({ isNewUser: true, user: { phone: p, role: 'CUSTOMER' } });
      expect(first.body.data.user.referralCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(first.body.data.accessToken).toEqual(expect.any(String));
      expect(first.body.data.expiresIn).toBe(900);

      const second = await otpLogin(http, p);
      expect(second.body.data.isNewUser).toBe(false);
      expect(second.body.data.user.id).toBe(first.body.data.user.id);

      const dbUser = await t.prisma.user.findUniqueOrThrow({ where: { phone: p } });
      expect(dbUser.phoneVerifiedAt).not.toBeNull();
      expect(dbUser.lastLoginAt).not.toBeNull();
    });

    it('honours the requested role only on first login', async () => {
      const p = phone();
      const first = await otpLogin(http, p, 'RIDER');
      expect(first.body.data.user.role).toBe('RIDER');
      const again = await otpLogin(http, p, 'VENDOR_OWNER');
      expect(again.body.data.user.role).toBe('RIDER');
    });

    it('refuses to let a phone code create or open an ADMIN account', async () => {
      const p = phone();
      await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
      const res = await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: '123456', role: 'ADMIN' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('sets an httpOnly refresh cookie scoped to /api/v1/auth', async () => {
      const p = phone();
      const res = await otpLogin(http, p);
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('dhoblio_rt='))!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    });

    it('does not return the refresh token in the body unless the client opts in', async () => {
      const p = phone();
      await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
      const res = await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: '123456' }).expect(200);
      expect(res.body.data.refreshToken).toBeUndefined();
    });

    it('rejects a wrong code and a code that was never requested', async () => {
      const p = phone();
      await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
      const wrong = await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: '000000' }).expect(400);
      expect(wrong.body.error.code).toBe('INVALID_OTP');
      const never = await http.post('/api/v1/auth/otp/verify').send({ phone: phone(), code: '123456' }).expect(400);
      expect(never.body.error.code).toBe('INVALID_OTP');
    });

    it('rejects an expired code', async () => {
      const p = phone();
      await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
      await t.redis.del(otpKey(p)); // what TTL expiry does
      await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: '123456' }).expect(400);
    });

    it('works once only', async () => {
      const p = phone();
      await otpLogin(http, p);
      await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: '123456' }).expect(400);
    });

    it('locks the code after 5 wrong guesses, even if the next guess is right', async () => {
      const p = phone();
      await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
      for (let i = 0; i < 5; i++) {
        await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: '111111' }).expect(400);
      }
      const res = await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: '123456' }).expect(400);
      expect(res.body.error.code).toBe('INVALID_OTP');
      expect(await t.redis.exists(otpKey(p))).toBe(0);
    });

    it('does not accept a code issued for another phone', async () => {
      const a = phone();
      const b = phone();
      await http.post('/api/v1/auth/otp/request').send({ phone: a }).expect(200);
      await t.redis.hset(otpKey(b), { hash: (await t.redis.hget(otpKey(a), 'hash'))!, attempts: 0 });
      await http.post('/api/v1/auth/otp/verify').send({ phone: b, code: '123456' }).expect(400);
    });

    it('blocks suspended accounts at login', async () => {
      const p = phone();
      await otpLogin(http, p);
      await t.prisma.user.update({ where: { phone: p }, data: { status: 'SUSPENDED' } });
      await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
      const res = await http.post('/api/v1/auth/otp/verify').send({ phone: p, code: '123456' }).expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('verifies the HMAC scheme documented for stored codes', async () => {
      const p = phone();
      await http.post('/api/v1/auth/otp/request').send({ phone: p }).expect(200);
      const key = Buffer.from(process.env.HMAC_KEY_BASE64!, 'base64');
      expect(await t.redis.hget(otpKey(p), 'hash')).toBe(hashOtp(p, '123456', key));
    });
  });

  describe('Tokens', () => {
    it('protects routes: no token, bad token', async () => {
      await http.get('/api/v1/me').expect(401);
      await http.get('/api/v1/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });

    it('rotates refresh tokens and returns a working access token', async () => {
      const login = await otpLogin(http, phone());
      const { refreshToken } = login.body.data;

      const refreshed = await http.post('/api/v1/auth/refresh').send({ refreshToken }).expect(200);
      expect(refreshed.body.data.accessToken).toEqual(expect.any(String));
      await http.get('/api/v1/me').set('Authorization', `Bearer ${refreshed.body.data.accessToken}`).expect(200);
    });

    it('accepts the refresh token from the cookie', async () => {
      const agent = request.agent(t.app.getHttpServer());
      await otpLogin(agent, phone());
      const res = await agent.post('/api/v1/auth/refresh').send({}).expect(200);
      expect(res.body.data.user.role).toBe('CUSTOMER');
    });

    it('detects refresh-token reuse and revokes the whole login', async () => {
      const login = await otpLogin(http, phone());
      const original = login.body.data.refreshToken as string;

      const rotated = await http
        .post('/api/v1/auth/refresh')
        .set('x-token-transport', 'body')
        .send({ refreshToken: original })
        .expect(200);
      const newer = rotated.body.data.refreshToken as string;

      // Replaying the old token is theft: it fails AND kills the newer token and access token of this login.
      const replay = await http.post('/api/v1/auth/refresh').send({ refreshToken: original }).expect(401);
      expect(replay.body.error.code).toBe('UNAUTHENTICATED');
      await http.post('/api/v1/auth/refresh').send({ refreshToken: newer }).expect(401);
      await http.get('/api/v1/me').set('Authorization', `Bearer ${rotated.body.data.accessToken}`).expect(401);
    });

    it('only one of two concurrent refreshes with the same token succeeds', async () => {
      const login = await otpLogin(http, phone());
      const { refreshToken } = login.body.data;
      const results = await Promise.all([
        http.post('/api/v1/auth/refresh').send({ refreshToken }),
        http.post('/api/v1/auth/refresh').send({ refreshToken }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('rejects unknown refresh tokens', async () => {
      await http.post('/api/v1/auth/refresh').send({ refreshToken: 'x'.repeat(64) }).expect(401);
      await http.post('/api/v1/auth/refresh').send({}).expect(401);
    });

    it('stores refresh tokens hashed, never raw', async () => {
      const p = phone();
      const login = await otpLogin(http, p);
      const user = await t.prisma.user.findUniqueOrThrow({ where: { phone: p } });
      const sessions = await t.prisma.session.findMany({ where: { userId: user.id } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].refreshHash).not.toBe(login.body.data.refreshToken);
      expect(sessions[0].refreshHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('logout kills the refresh token and the access token immediately', async () => {
      const login = await otpLogin(http, phone());
      const { accessToken, refreshToken } = login.body.data;
      await http.get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(200);

      await http.post('/api/v1/auth/logout').send({ refreshToken }).expect(200);

      await http.get('/api/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
      await http.post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('logout with garbage still succeeds', async () => {
      await http.post('/api/v1/auth/logout').send({ refreshToken: 'nope' }).expect(200);
    });

    it('applies a suspension to already-issued access tokens', async () => {
      const p = phone();
      const login = await otpLogin(http, p);
      await http.get('/api/v1/me').set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(200);
      await t.prisma.user.update({ where: { phone: p }, data: { status: 'SUSPENDED' } });
      const res = await http.get('/api/v1/me').set('Authorization', `Bearer ${login.body.data.accessToken}`).expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('Admin login', () => {
    const password = 'Correct-Horse-Battery-9';
    let email: string;

    beforeEach(async () => {
      email = `admin-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
      adminEmails.push(email);
      await t.prisma.user.create({
        data: {
          phone: `+92000${Math.floor(1e6 + Math.random() * 9e6)}`,
          email,
          role: 'ADMIN',
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        },
      });
    });

    it('signs an admin in with email + password', async () => {
      const res = await http.post('/api/v1/auth/admin/login').send({ email: email.toUpperCase(), password }).expect(200);
      expect(res.body.data.user.role).toBe('ADMIN');
      await http.get('/api/v1/me').set('Authorization', `Bearer ${res.body.data.accessToken}`).expect(200);
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      const wrong = await http.post('/api/v1/auth/admin/login').send({ email, password: 'nope-nope' }).expect(401);
      const unknown = await http.post('/api/v1/auth/admin/login').send({ email: 'ghost@e2e.test', password }).expect(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.error).toEqual({ ...wrong.body.error, requestId: unknown.body.error.requestId });
    });

    it('locks the account after 5 failures, even for the right password', async () => {
      for (let i = 0; i < 5; i++) {
        await http.post('/api/v1/auth/admin/login').send({ email, password: 'wrong-wrong' }).expect(401);
      }
      const locked = await http.post('/api/v1/auth/admin/login').send({ email, password }).expect(429);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    });

    it('a successful login resets the failure counter', async () => {
      for (let i = 0; i < 4; i++) {
        await http.post('/api/v1/auth/admin/login').send({ email, password: 'wrong-wrong' }).expect(401);
      }
      await http.post('/api/v1/auth/admin/login').send({ email, password }).expect(200);
      for (let i = 0; i < 4; i++) {
        await http.post('/api/v1/auth/admin/login').send({ email, password: 'wrong-wrong' }).expect(401);
      }
      await http.post('/api/v1/auth/admin/login').send({ email, password }).expect(200);
    });

    it('does not let non-admins in through the admin endpoint', async () => {
      const p = phone();
      await otpLogin(http, p);
      await t.prisma.user.update({ where: { phone: p }, data: { email: `cust-${Date.now()}@e2e.test`, passwordHash: await argon2.hash(password) } });
      const row = await t.prisma.user.findUniqueOrThrow({ where: { phone: p } });
      adminEmails.push(row.email!);
      await http.post('/api/v1/auth/admin/login').send({ email: row.email, password }).expect(401);
    });
  });
});
