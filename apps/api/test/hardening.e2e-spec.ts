import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { Reflector } from '@nestjs/core';
import { Queue } from 'bullmq';
import request from 'supertest';
import { securityHeaders } from '../src/common/security/headers';
import { RATE_LIMIT_KEY } from '../src/common/rate-limit/rate-limit.decorator';
import { Clock } from '../src/common/time/clock';
import { QUEUES } from '../src/infra/queue/queues';
import { AuthController } from '../src/modules/auth/auth.controller';
import { CartController } from '../src/modules/cart/cart.controller';
import { ComplaintsController } from '../src/modules/complaints/complaints.controller';
import { ShutdownService } from '../src/modules/health/shutdown.service';
import { RiderController } from '../src/modules/delivery/rider.controller';
import { VendorFinanceController } from '../src/modules/finance/vendor-finance.controller';
import { OpsAlertService } from '../src/modules/delivery/ops-alert.service';
import { PaymentsController } from '../src/modules/payments/payments.controller';
import { PaymentWebhooksController } from '../src/modules/payments/webhooks.controller';
import { PromosController } from '../src/modules/promos/promos.controller';
import { QueueHealthService } from '../src/modules/ops/queue-health.service';
import { RetentionService } from '../src/modules/ops/retention.service';
import { ReviewsController } from '../src/modules/reviews/reviews.controller';
import { VendorController } from '../src/modules/vendors/vendor.controller';
import { TestApp, clearRateLimits, createAdmin, createCustomer, createTestApp, fixedClock, otpLogin, prepareReferenceData, randomPhone } from './helpers';

const NOW = new Date('2027-06-01T07:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('Hardening (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
    await prepareReferenceData(t);
    admin = await createAdmin(t);
  });
  beforeEach(() => clearRateLimits(t.redis));
  afterAll(() => t.close());

  describe('security headers', () => {
    it('API answers lock everything down and are never cached', async () => {
      const res = await http.get('/api/v1/health/live').expect(200);
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['strict-transport-security']).toBeUndefined(); // only in production, behind TLS
    });

    it('errors and authenticated answers carry them too', async () => {
      const res = await http.get('/api/v1/admin/queues').expect(401);
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['cache-control']).toBe('no-store');
      const ok = await http.get('/api/v1/admin/queues').set(admin.auth).expect(200);
      expect(ok.headers['cache-control']).toBe('no-store');
    });

    it('the docs page keeps working: it may run its own scripts, and nothing from elsewhere', async () => {
      const res = await http.get('/api/v1/docs').expect(200);
      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).not.toMatch(/https?:\/\//);
      expect(res.headers['cache-control']).not.toBe('no-store');
    });

    it('production adds HSTS', async () => {
      expect(securityHeaders(true).strictTransportSecurity).toMatchObject({ maxAge: 31_536_000, includeSubDomains: true });
      expect(securityHeaders(false).strictTransportSecurity).toBe(false);
    });
  });

  describe('CORS', () => {
    const ORIGIN = 'http://localhost:3000'; // APP_URL default, so the allowed origin in tests

    it('lets the web app call with credentials, only with the headers and methods we use', async () => {
      const res = await http
        .options('/api/v1/orders')
        .set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,idempotency-key')
        .expect(204);
      expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-methods']).toBe('GET,POST,PUT,PATCH,DELETE,OPTIONS');
      expect(res.headers['access-control-allow-headers']).toBe('authorization,content-type,idempotency-key,x-token-transport,last-event-id,accept-language');
      expect(res.headers['access-control-max-age']).toBe('600');
    });

    it('gives other sites nothing', async () => {
      for (const origin of ['https://evil.example', 'http://localhost:3001', 'null']) {
        const res = await http.get('/api/v1/cities').set('Origin', origin);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      }
    });
  });

  describe('cookie sign-in and CSRF', () => {
    async function signedIn() {
      const phone = randomPhone();
      await http.post('/api/v1/auth/otp/request').send({ phone }).expect(200);
      const res = await http.post('/api/v1/auth/otp/verify').send({ phone, code: '123456' }).expect(200);
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('dhoblio_rt='))!;
      return { cookie: cookie.split(';')[0] };
    }

    it('the refresh cookie is httpOnly, SameSite=Strict and limited to the auth paths', async () => {
      const { cookie } = await signedIn();
      const phone = randomPhone();
      const res = await otpLogin(http, phone);
      const full = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('dhoblio_rt='))!;
      expect(cookie).toMatch(/^dhoblio_rt=/);
      expect(full).toMatch(/HttpOnly/i);
      expect(full).toMatch(/SameSite=Strict/i);
      expect(full).toMatch(/Path=\/api\/v1\/auth/);
    });

    it('refuses a cookie refresh that comes from another site, and keeps the session', async () => {
      const { cookie } = await signedIn();
      const evil = await http.post('/api/v1/auth/refresh').set('Cookie', cookie).set('Origin', 'https://evil.example').send({}).expect(403);
      expect(evil.body.error.code).toBe('CSRF_ORIGIN');
      // the forged request did not use up or revoke the cookie
      await http.post('/api/v1/auth/refresh').set('Cookie', cookie).set('Origin', 'http://localhost:3000').send({}).expect(200);
    });

    it('allows our own site, and clients that send no Origin (mobile apps, scripts)', async () => {
      const a = await signedIn();
      await http.post('/api/v1/auth/refresh').set('Cookie', a.cookie).set('Origin', 'http://localhost:3000').send({}).expect(200);
      const b = await signedIn();
      await http.post('/api/v1/auth/refresh').set('Cookie', b.cookie).send({}).expect(200);
    });

    it('refuses a cross-site logout that uses the cookie', async () => {
      const { cookie } = await signedIn();
      await http.post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', 'https://evil.example').send({}).expect(403);
      await http.post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', 'http://localhost:3000').send({}).expect(200);
    });

    it('does not apply to the body transport, which a web page cannot use without the token', async () => {
      const phone = randomPhone();
      const res = await http.post('/api/v1/auth/otp/request').send({ phone }).expect(200);
      expect(res.status).toBe(200);
      const login = await http.post('/api/v1/auth/otp/verify').set('x-token-transport', 'body').send({ phone, code: '123456' }).expect(200);
      await http.post('/api/v1/auth/refresh').set('Origin', 'https://other.example').send({ refreshToken: login.body.data.refreshToken }).expect(200);
    });
  });

  describe('rate limits', () => {
    it('promo guessing: 30 a minute per person, then 429 with a retry time', async () => {
      const c = await createCustomer(t);
      const codes: number[] = [];
      for (let i = 0; i < 31; i++) codes.push((await http.post('/api/v1/promos/validate').set(c.auth).send({ code: `GUESS${i}`, subtotal: '500.00', vendorId: randomUUID() })).status);
      expect(codes.slice(0, 30).every((s) => s !== 429)).toBe(true);
      expect(codes[30]).toBe(429);
      const again = await http.post('/api/v1/promos/validate').set(c.auth).send({ code: 'X', subtotal: '500.00', vendorId: randomUUID() }).expect(429);
      expect(again.body.error.code).toBe('RATE_LIMITED');
      expect(again.body.error.details.retryAfterSec).toBeGreaterThan(0);
    });

    it('is counted per person: one customer’s limit does not stop another', async () => {
      const a = await createCustomer(t);
      const b = await createCustomer(t);
      for (let i = 0; i < 31; i++) await http.post('/api/v1/promos/validate').set(a.auth).send({ code: 'X', subtotal: '1.00', vendorId: randomUUID() });
      await http.post('/api/v1/promos/validate').set(a.auth).send({ code: 'X', subtotal: '1.00', vendorId: randomUUID() }).expect(429);
      const other = await http.post('/api/v1/promos/validate').set(b.auth).send({ code: 'X', subtotal: '1.00', vendorId: randomUUID() });
      expect(other.status).not.toBe(429);
    });

    it('cookie refresh is limited per IP, and a different IP is unaffected', async () => {
      const ip = (n: string) => ({ 'X-Forwarded-For': n });
      for (let i = 0; i < 30; i++) await http.post('/api/v1/auth/refresh').set(ip('203.0.113.50')).send({ refreshToken: 'nope' });
      await http.post('/api/v1/auth/refresh').set(ip('203.0.113.50')).send({ refreshToken: 'nope' }).expect(429);
      const elsewhere = await http.post('/api/v1/auth/refresh').set(ip('203.0.113.51')).send({ refreshToken: 'nope' });
      expect(elsewhere.status).toBe(401);
    });

    it('the health probes are never limited', async () => {
      for (let i = 0; i < 40; i++) await http.get('/api/v1/health/ready').expect(200);
    });

    it('every abuse-prone route carries its own limit (a review checklist that cannot silently rot)', () => {
      const reflector = new Reflector();
      const limited: [object, string, string][] = [
        [PromosController, 'validate', 'promo-validate'],
        [AuthController, 'refresh', 'auth-refresh'],
        [AuthController, 'logout', 'auth-logout'],
        [PaymentsController, 'initiate', 'payment-start'],
        [PaymentWebhooksController, 'receive', 'webhook'],
        [CartController, 'estimate', 'cart-estimate'],
        [VendorController, 'register', 'vendor-register'],
        [RiderController, 'register', 'rider-register'],
        [RiderController, 'location', 'rider-location'],
        [VendorFinanceController, 'request', 'payout-request'],
        [ReviewsController, 'create', 'review-create'],
        [ComplaintsController, 'create', 'complaint-create'],
      ];
      const missing: string[] = [];
      for (const [controller, method, name] of limited) {
        const proto = (controller as { prototype: Record<string, unknown> }).prototype;
        const fn = proto[method];
        if (typeof fn !== 'function') {
          missing.push(`${(controller as { name: string }).name}.${method} does not exist`);
          continue;
        }
        const meta = reflector.get<{ name: string }>(RATE_LIMIT_KEY, fn as () => void);
        if (meta?.name !== name) missing.push(`${(controller as { name: string }).name}.${method}: expected ${name}, found ${meta?.name}`);
      }
      expect(missing).toEqual([]);
    });
  });

  describe('queue health', () => {
    let health: QueueHealthService;
    let alerts: jest.SpyInstance;
    let queue: Queue;

    beforeAll(() => {
      health = t.app.get(QueueHealthService);
      queue = t.app.get<Queue>(getQueueToken(QUEUES.MAINTENANCE));
    });
    beforeEach(async () => {
      await queue.obliterate({ force: true });
      for (const key of await t.redis.keys('ops:queue-alert:*')) await t.redis.del(key);
      alerts = jest.spyOn(t.app.get(OpsAlertService), 'alert').mockResolvedValue();
    });
    afterEach(() => jest.restoreAllMocks());

    it('reports every queue, healthy when nothing is wrong', async () => {
      const res = await http.get('/api/v1/admin/queues').set(admin.auth).expect(200);
      expect(res.body.data.queues.map((q: { queue: string }) => q.queue).sort()).toEqual(Object.values(QUEUES).sort());
      expect(res.body.data.queues[0]).toEqual(expect.objectContaining({ waiting: expect.any(Number), failed: expect.any(Number), stuck: 0, healthy: true }));
      expect((await health.check()).unhealthy).toEqual([]);
      expect(alerts).not.toHaveBeenCalled();
    });

    it('alerts once when failed jobs pile up, then stays quiet until the cooldown ends', async () => {
      const failedJob = { id: '9', name: 'send-sms', failedReason: 'gateway timeout', attemptsMade: 5, finishedOn: Date.now() };
      jest.spyOn(Queue.prototype, 'getJobCounts').mockImplementation(async function (this: Queue) {
        return this.name === QUEUES.NOTIFICATIONS ? ({ waiting: 0, active: 0, delayed: 0, failed: 25 } as never) : ({ waiting: 0, active: 0, delayed: 0, failed: 0 } as never);
      });
      jest.spyOn(Queue.prototype, 'getFailed').mockImplementation(async function (this: Queue) {
        return this.name === QUEUES.NOTIFICATIONS ? ([failedJob] as never) : [];
      });
      const first = await health.check();
      expect(first).toEqual({ unhealthy: ['notifications'], alerted: 1 });
      expect(alerts).toHaveBeenCalledWith('Queue "notifications" needs attention', expect.stringContaining('25 jobs failed all their retries (latest: gateway timeout)'), { queue: 'notifications', kind: 'failed' });
      expect(await health.check()).toEqual({ unhealthy: ['notifications'], alerted: 0 });
      expect(alerts).toHaveBeenCalledTimes(1);
      const shown = (await http.get('/api/v1/admin/queues').set(admin.auth).expect(200)).body.data;
      expect(shown.healthy).toBe(false);
      expect(shown.queues.find((q: { queue: string }) => q.queue === 'notifications')).toMatchObject({ failed: 25, healthy: false, recentFailures: [{ id: '9', reason: 'gateway timeout', attemptsMade: 5 }] });
    });

    it('alerts about a backlog', async () => {
      jest.spyOn(Queue.prototype, 'getJobCounts').mockImplementation(async function (this: Queue) {
        return { waiting: this.name === QUEUES.PAYMENTS ? 5000 : 0, active: 0, delayed: 0, failed: 0 } as never;
      });
      const r = await health.check();
      expect(r.unhealthy).toEqual(['payments']);
      expect(alerts).toHaveBeenCalledWith('Queue "payments" needs attention', expect.stringContaining('5000 jobs are waiting'), { queue: 'payments', kind: 'backlog' });
    });

    it('spots a job that has been running far too long', async () => {
      jest.spyOn(Queue.prototype, 'getActive').mockImplementation(async function (this: Queue) {
        return this.name === QUEUES.EXPORTS ? ([{ processedOn: Date.now() - 60 * 60_000 }, { processedOn: Date.now() - 1000 }] as never) : [];
      });
      const r = await health.check();
      expect(r.unhealthy).toEqual(['exports']);
      expect(alerts).toHaveBeenCalledWith('Queue "exports" needs attention', expect.stringContaining('1 jobs have been running for over 15 minutes'), { queue: 'exports', kind: 'stuck' });
    });

    it('retries failed jobs on request, audited, and survives a job that cannot be retried', async () => {
      const retry = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('gone')).mockResolvedValueOnce(undefined);
      jest.spyOn(Queue.prototype, 'getFailed').mockResolvedValue([{ id: '1', retry }, { id: '2', retry }, { id: '3', retry }] as never);
      const res = await http.post('/api/v1/admin/queues/notifications/retry-failed').set(admin.auth).expect(200);
      expect(res.body.data).toEqual({ queue: 'notifications', retried: 2 });
      expect(retry).toHaveBeenCalledWith('failed');
      const audit = await t.prisma.auditLog.findFirst({ where: { action: 'QUEUE_FAILED_RETRIED', entityId: 'notifications' } });
      expect(audit).toMatchObject({ entity: 'Queue', actorId: admin.user.id });
    });

    it('is for admins only, and only for real queues', async () => {
      const c = await createCustomer(t);
      await http.get('/api/v1/admin/queues').expect(401);
      await http.get('/api/v1/admin/queues').set(c.auth).expect(403);
      await http.post('/api/v1/admin/queues/notifications/retry-failed').set(c.auth).expect(403);
      await http.post('/api/v1/admin/queues/not-a-queue/retry-failed').set(admin.auth).expect(400);
    });
  });

  describe('retention', () => {
    let clock: ReturnType<typeof fixedClock>;
    let retention: RetentionService;
    let local: TestApp;

    beforeAll(async () => {
      clock = fixedClock(NOW);
      local = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
      retention = local.app.get(RetentionService);
    });
    afterAll(() => local.close());

    it('removes expired login codes, sessions, delivered notifications and webhook payloads, and nothing the business needs', async () => {
      const p = local.prisma;
      const user = await createCustomer(local);
      const partner = await p.courierPartner.create({ data: { name: `Partner ${randomUUID().slice(0, 6)}`, code: `P${randomUUID().slice(0, 6)}`, isActive: true } as never });
      const otp = (age: number) => p.otpCode.create({ data: { phone: randomPhone(), purpose: 'LOGIN', codeHash: 'x', expiresAt: daysAgo(age - 1), createdAt: daysAgo(age) } });
      const session = (data: { expiresAt: Date; revokedAt?: Date }) => p.session.create({ data: { userId: user.user.id, refreshHash: randomUUID(), ...data } });
      const note = (age: number, status: 'SENT' | 'FAILED' | 'QUEUED') =>
        p.notification.create({ data: { userId: user.user.id, channel: 'SMS', template: 't', payload: {}, status, createdAt: daysAgo(age) } });
      const event = (age: number) => p.courierWebhookEvent.create({ data: { partnerId: partner.id, eventId: randomUUID(), createdAt: daysAgo(age) } });

      const keep = { otp: await otp(1), session1: await session({ expiresAt: daysAgo(-5) }), session2: await session({ expiresAt: daysAgo(10) }), session3: await session({ expiresAt: daysAgo(-5), revokedAt: daysAgo(3) }), n1: await note(10, 'SENT'), n2: await note(400, 'QUEUED'), e1: await event(10) };
      const drop = { otp: await otp(5), session1: await session({ expiresAt: daysAgo(40) }), session2: await session({ expiresAt: daysAgo(-1), revokedAt: daysAgo(45) }), n1: await note(200, 'SENT'), n2: await note(200, 'FAILED'), e1: await event(120) };
      const audits = await p.auditLog.count();
      const orders = await p.order.count();

      const result = await retention.purge();
      expect(result.otpCodes).toBeGreaterThanOrEqual(1);
      expect(result.sessions).toBeGreaterThanOrEqual(2);
      expect(result.notifications).toBeGreaterThanOrEqual(2);
      expect(result.courierEvents).toBeGreaterThanOrEqual(1);

      expect(await p.otpCode.count({ where: { id: { in: [keep.otp.id, drop.otp.id] } } })).toBe(1);
      expect(await p.otpCode.findUnique({ where: { id: keep.otp.id } })).not.toBeNull();
      expect((await p.session.findMany({ where: { id: { in: [keep.session1.id, keep.session2.id, keep.session3.id, drop.session1.id, drop.session2.id] } }, select: { id: true } })).map((s) => s.id).sort()).toEqual([keep.session1.id, keep.session2.id, keep.session3.id].sort());
      expect((await p.notification.findMany({ where: { id: { in: [keep.n1.id, keep.n2.id, drop.n1.id, drop.n2.id] } }, select: { id: true } })).map((s) => s.id).sort()).toEqual([keep.n1.id, keep.n2.id].sort()); // an undelivered message is never removed
      expect((await p.courierWebhookEvent.findMany({ where: { id: { in: [keep.e1.id, drop.e1.id] } }, select: { id: true } })).map((s) => s.id)).toEqual([keep.e1.id]);
      expect(await p.auditLog.count()).toBe(audits);
      expect(await p.order.count()).toBe(orders);
    });

    it('is repeatable: a second run finds nothing more to remove', async () => {
      await retention.purge();
      expect(await retention.purge()).toEqual({ otpCodes: 0, sessions: 0, notifications: 0, courierEvents: 0 });
    });
  });

  describe('graceful shutdown', () => {
    it('stops being ready as soon as shutdown starts, while staying alive for requests in flight', async () => {
      const local = await createTestApp();
      const api = request(local.app.getHttpServer());
      await api.get('/api/v1/health/ready').expect(200);
      await local.app.get(ShutdownService).beforeApplicationShutdown('SIGTERM');
      const ready = await api.get('/api/v1/health/ready').expect(503);
      expect(ready.body.error).toMatchObject({ code: 'NOT_READY', details: { draining: true } });
      await api.get('/api/v1/health/live').expect(200);
      await local.close();
    });
  });
});
