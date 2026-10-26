import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { Role } from '@prisma/client';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { QUEUES } from '../src/infra/queue/queues';
import { AnnouncementFanoutService, SEND_RATE_PER_SEC, staggerDelayMs } from '../src/modules/announcements/announcement-fanout.service';
import { createRider } from './delivery-helpers';
import { waitFor } from './order-helpers';
import { Basics, TestApp, clearRateLimits, createAdmin, createCustomer, createTestApp, createUserWithToken, createVendorFixture, fixedClock, prepareReferenceData, randomPhone } from './helpers';

const NOW = new Date('2026-04-20T07:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe('Announcements (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let fanout: AnnouncementFanoutService;
  let queue: Queue;
  let cityId: number;
  let c1: Awaited<ReturnType<typeof createCustomer>>;
  let c2: Awaited<ReturnType<typeof createCustomer>>;
  let c3: Awaited<ReturnType<typeof createCustomer>>;
  let c4: Awaited<ReturnType<typeof createCustomer>>;
  let outsider: Awaited<ReturnType<typeof createCustomer>>;

  const post = (path: string, body: object, auth = admin.auth) => http.post(`/api/v1${path}`).set(auth).send(body);
  const get = (path: string, auth = admin.auth) => http.get(`/api/v1${path}`).set(auth);
  const segment = (extra: object = {}) => ({ cityId, ...extra });
  const pending = () => queue.getJobs(['waiting', 'delayed']);

  async function member(role: Role, city: number, fields: { lastLoginAt?: Date | null; prefs?: object; token?: boolean; locale?: 'EN' | 'UR'; status?: 'ACTIVE' | 'SUSPENDED'; email?: string } = {}) {
    const u = await createCustomer(t);
    await t.prisma.user.update({
      where: { id: u.user.id },
      data: {
        role,
        lastLoginAt: fields.lastLoginAt ?? null,
        notificationPrefs: fields.prefs ?? undefined,
        locale: fields.locale ?? 'EN',
        status: fields.status ?? 'ACTIVE',
        email: fields.email,
      },
    });
    if (role === Role.CUSTOMER) await t.prisma.address.create({ data: { userId: u.user.id, cityId: city, line1: '1 Test Rd', label: 'Home', lat: 31.5, lng: 74.3 } });
    if (fields.token) await t.prisma.deviceToken.create({ data: { userId: u.user.id, token: `tok-${randomUUID()}`, platform: 'android' } });
    return u;
  }

  beforeAll(async () => {
    clock = fixedClock(NOW);
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    fanout = t.app.get(AnnouncementFanoutService);
    queue = t.app.get<Queue>(getQueueToken(QUEUES.NOTIFICATIONS));
    // A city of our own, so nobody from another suite is in the audience.
    cityId = (await t.prisma.city.create({ data: { name: `Announceville ${randomUUID().slice(0, 6)}` } })).id;

    c1 = await member(Role.CUSTOMER, cityId, { lastLoginAt: daysAgo(5), token: true });
    c2 = await member(Role.CUSTOMER, cityId, { lastLoginAt: daysAgo(100), prefs: { sms: false } });
    c3 = await member(Role.CUSTOMER, cityId, { lastLoginAt: daysAgo(10), token: true, prefs: { push: false }, locale: 'UR' });
    c4 = await member(Role.CUSTOMER, cityId, { lastLoginAt: daysAgo(1), token: true, status: 'SUSPENDED' });
    outsider = await member(Role.CUSTOMER, basics.cityId, { lastLoginAt: daysAgo(1), token: true });

    const shop = await createVendorFixture(t, cityId);
    await t.prisma.user.update({ where: { id: shop.owner.user.id }, data: { email: 'owner@announce.test' } });
    const staff = await createUserWithToken(t, Role.VENDOR_STAFF);
    await t.prisma.vendorStaff.create({ data: { vendorId: shop.vendor.id, userId: staff.user.id } });
    await createRider(t, { ...basics, cityId }, { online: false });
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
    await queue.obliterate({ force: true });
  });
  afterAll(() => t.close());

  describe('stagger', () => {
    it('holds back the n-th message so no second carries more than the channel rate', () => {
      expect([0, 19, 20, 39, 40, 100].map((i) => staggerDelayMs(i, 20))).toEqual([0, 0, 1000, 1000, 2000, 5000]);
      expect(staggerDelayMs(199, 200)).toBe(0);
      expect(staggerDelayMs(200, 200)).toBe(1000);
      expect(SEND_RATE_PER_SEC.SMS).toBeLessThan(SEND_RATE_PER_SEC.PUSH);
    });
  });

  describe('preview', () => {
    it('counts who an audience reaches, by role and by channel, leaving out suspended people and other cities', async () => {
      const d = (await post('/admin/announcements/preview', { segment: segment({ roles: ['CUSTOMER'] }), channels: ['PUSH', 'SMS', 'EMAIL'] }).expect(200)).body.data;
      expect(d).toMatchObject({ recipients: 3, byRole: { CUSTOMER: 3 } });
      // push: only c1 (c2 has no phone token, c3 switched push off); sms: c1 and c3 (c2 switched it off)
      expect(d.byChannel).toEqual({ PUSH: 1, SMS: 2, EMAIL: 0 });
      expect(d.reachable).toBe(2);
    });

    it('covers everyone connected to the city when no role is given', async () => {
      const d = (await post('/admin/announcements/preview', { segment: segment(), channels: ['EMAIL'] }).expect(200)).body.data;
      expect(d.byRole).toEqual({ CUSTOMER: 3, VENDOR_OWNER: 1, VENDOR_STAFF: 1, RIDER: 1 });
      expect(d.recipients).toBe(6);
      expect(d.byChannel.EMAIL).toBe(1); // only the owner has an email address
    });

    it('splits active people from people who have gone quiet', async () => {
      const active = (await post('/admin/announcements/preview', { segment: segment({ roles: ['CUSTOMER'], activeWithinDays: 30 }) }).expect(200)).body.data;
      expect(active.recipients).toBe(2); // c1 and c3
      const quiet = (await post('/admin/announcements/preview', { segment: segment({ roles: ['CUSTOMER'], inactiveForDays: 30 }) }).expect(200)).body.data;
      expect(quiet.recipients).toBe(1); // c2
    });

    it('counts a recent order as being active even without a recent sign-in', async () => {
      const v = await createVendorFixture(t, cityId);
      await t.prisma.order.create({
        data: {
          orderNo: `AN-${randomUUID().slice(0, 8)}`, customerId: c2.user.id, vendorId: v.vendor.id, cityId, addressSnapshot: {}, status: 'PLACED',
          pickupSlotStart: NOW, pickupSlotEnd: NOW, deliverySlotStart: NOW, deliverySlotEnd: NOW, subtotal: 1, total: 1, commissionRatePct: 15,
          commissionAmount: 0, vendorEarning: 1, paymentMethod: 'COD', paymentStatus: 'COD_PENDING', vendorRespondBy: NOW, createdAt: daysAgo(3),
        },
      });
      const active = (await post('/admin/announcements/preview', { segment: segment({ roles: ['CUSTOMER'], activeWithinDays: 30 }) }).expect(200)).body.data;
      expect(active.recipients).toBe(3);
      await t.prisma.order.deleteMany({ where: { customerId: c2.user.id } });
    });

    it('is also the way to see an audience of nobody', async () => {
      const d = (await post('/admin/announcements/preview', { segment: { cityId: cityId + 9999 } }).expect(200)).body.data;
      expect(d).toMatchObject({ recipients: 0, reachable: 0 });
    });

    it('refuses contradictory or unknown audiences', async () => {
      for (const body of [
        { segment: { activeWithinDays: 7, inactiveForDays: 7 } },
        { segment: { roles: ['ADMIN'] } },
        { segment: { roles: ['CUSTOMER', 'CUSTOMER'] } },
        { segment: { activeWithinDays: 0 } },
        { segment: { cityId: 'x' } },
        { segment: {}, channels: ['WHATSAPP'] },
        { segment: {}, channels: [] },
        {},
      ]) {
        await post('/admin/announcements/preview', body).expect(400);
      }
    });
  });

  describe('sending', () => {
    const body = (extra: object = {}) => ({ title: 'Eid offer', body: '15% off this week.', segment: segment({ roles: ['CUSTOMER'] }), confirmRecipients: 3, ...extra });

    it('queues the announcement for the worker and records who sent it', async () => {
      const res = await post('/admin/announcements', body()).expect(202);
      expect(res.body.data).toMatchObject({ title: 'Eid offer', status: 'QUEUED', channels: ['PUSH'], recipientCount: 3, messagesQueued: 0, sentById: admin.user.id });
      const jobs = await pending();
      expect(jobs.map((j) => [j.name, j.data])).toEqual([['fan-out-announcement', { announcementId: res.body.data.id }]]);
      const audit = await waitFor(() => t.prisma.auditLog.findFirst({ where: { action: 'ANNOUNCEMENT_SENT', entityId: res.body.data.id } }), 3000, 'the audit entry');
      expect(audit).toMatchObject({ entity: 'Announcement', actorId: admin.user.id });
    });

    it('refuses to send when the audience is not what was previewed, and when nobody would get it', async () => {
      const stale = await post('/admin/announcements', body({ confirmRecipients: 5 })).expect(409);
      expect(stale.body.error).toMatchObject({ code: 'AUDIENCE_CHANGED', details: { recipients: 3 } });
      const none = await post('/admin/announcements', body({ segment: { cityId: cityId + 9999 }, confirmRecipients: 0 })).expect(422);
      expect(none.body.error.code).toBe('NO_RECIPIENTS');
      expect(await pending()).toHaveLength(0);
    });

    it('fans out one message per person per chosen channel, skipping channels they switched off', async () => {
      const created = (await post('/admin/announcements', body({ channels: ['PUSH', 'SMS'] })).expect(202)).body.data;
      await queue.obliterate({ force: true });
      const done = await fanout.run(created.id);
      expect(done.queued).toBe(3); // c1 push + sms, c3 sms (push switched off), c2: none (no token, sms off)

      const rows = await t.prisma.notification.findMany({ where: { announcementId: created.id }, orderBy: { createdAt: 'asc' } });
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => [r.userId === c1.user.id ? 'c1' : r.userId === c3.user.id ? 'c3' : 'other', r.channel]).sort()).toEqual([['c1', 'PUSH'], ['c1', 'SMS'], ['c3', 'SMS']]);
      expect(rows.every((r) => r.template === 'announcement' && r.status === 'QUEUED')).toBe(true);
      expect(rows.some((r) => r.userId === c4.user.id || r.userId === outsider.user.id || r.userId === c2.user.id)).toBe(false);

      const jobs = await pending();
      expect(jobs).toHaveLength(3);
      const sms = jobs.find((j) => j.name === 'send-sms' && j.data.to === c1.user.phone)!;
      expect(sms.data.message).toBe('Dhoblio: Eid offer. 15% off this week.');
      expect(rows.map((r) => r.id)).toContain(sms.data.notificationId);
      const push = jobs.find((j) => j.name === 'send-push')!;
      expect(push.data).toMatchObject({ title: 'Eid offer', body: '15% off this week.', data: { announcementId: created.id } });
      expect(push.data.tokens).toHaveLength(1);

      const shown = (await get(`/admin/announcements/${created.id}`).expect(200)).body.data;
      expect(shown).toMatchObject({ status: 'SENT', recipientCount: 3, messagesQueued: 3 });
      expect(shown.completedAt).not.toBeNull();
      expect(shown.delivery).toEqual({ PUSH: { queued: 1, sent: 0, failed: 0 }, SMS: { queued: 2, sent: 0, failed: 0 } });
    });

    it('speaks Urdu to Urdu speakers when both Urdu fields are given', async () => {
      const created = (await post('/admin/announcements', body({ channels: ['SMS'], titleUr: 'عید آفر', bodyUr: 'اس ہفتے 15 فیصد رعایت۔' })).expect(202)).body.data;
      await queue.obliterate({ force: true });
      await fanout.run(created.id);
      const jobs = await pending();
      expect(jobs.find((j) => j.data.to === c3.user.phone)!.data.message).toBe('Dhoblio: عید آفر. اس ہفتے 15 فیصد رعایت۔');
      expect(jobs.find((j) => j.data.to === c1.user.phone)!.data.message).toBe('Dhoblio: Eid offer. 15% off this week.');
      await post('/admin/announcements', body({ titleUr: 'عید' })).expect(400);
    });

    it('running the fan-out again changes nothing (a crashed worker can retry safely)', async () => {
      const created = (await post('/admin/announcements', body({ channels: ['SMS'] })).expect(202)).body.data;
      await queue.obliterate({ force: true });
      await fanout.run(created.id);
      expect(await fanout.run(created.id)).toEqual({ queued: 0 });
      expect(await t.prisma.notification.count({ where: { announcementId: created.id } })).toBe(2);
      expect(await pending()).toHaveLength(2);
    });

    it('a queue outage mid-way fails the announcement, and the retry delivers to everyone exactly once', async () => {
      const created = (await post('/admin/announcements', body({ channels: ['SMS'] })).expect(202)).body.data;
      await queue.obliterate({ force: true });
      const spy = jest.spyOn(queue, 'addBulk').mockRejectedValueOnce(new Error('redis went away'));
      await expect(fanout.run(created.id)).rejects.toThrow('redis went away');
      expect((await get(`/admin/announcements/${created.id}`).expect(200)).body.data).toMatchObject({ status: 'FAILED' });
      expect(await t.prisma.notification.count({ where: { announcementId: created.id } })).toBe(0); // nothing half-recorded
      spy.mockRestore();
      expect((await fanout.run(created.id)).queued).toBe(2);
      expect(await t.prisma.notification.count({ where: { announcementId: created.id } })).toBe(2);
      expect((await get(`/admin/announcements/${created.id}`).expect(200)).body.data).toMatchObject({ status: 'SENT', error: null });
    });

    it('stops sending if the queue cannot even take the job, and says so', async () => {
      const spy = jest.spyOn(queue, 'add').mockRejectedValueOnce(new Error('redis down'));
      const res = await post('/admin/announcements', body()).expect(503);
      spy.mockRestore();
      expect(res.body.error.code).toBe('ANNOUNCEMENT_NOT_QUEUED');
      const [failed] = (await get('/admin/announcements?limit=1').expect(200)).body.data;
      expect(failed).toMatchObject({ status: 'FAILED', error: 'Could not queue the announcement' });
    });

    it('allows 5 announcements an hour per admin', async () => {
      const other = await createAdmin(t);
      for (let i = 0; i < 5; i++) await post('/admin/announcements', body(), other.auth).expect(202);
      const res = await post('/admin/announcements', body(), other.auth).expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });

    it('validates the message', async () => {
      for (const extra of [{ title: '' }, { title: 'x'.repeat(66) }, { body: '' }, { body: 'x'.repeat(501) }, { channels: ['WHATSAPP'] }, { confirmRecipients: -1 }, { confirmRecipients: 'many' }, { segment: undefined }, { surprise: true }]) {
        await post('/admin/announcements', body(extra)).expect(400);
      }
      await post('/admin/announcements', { title: 't', body: 'b', segment: {} }).expect(400); // confirmRecipients is required
    });
  });

  describe('provider limits (QA: batching respects them)', () => {
    let bulkCity: number;
    const PEOPLE = 45;

    beforeAll(async () => {
      bulkCity = (await t.prisma.city.create({ data: { name: `Bulkville ${randomUUID().slice(0, 6)}` } })).id;
      const users = Array.from({ length: PEOPLE }, () => ({ id: randomUUID(), phone: randomPhone(), role: Role.CUSTOMER, referralCode: randomUUID().slice(0, 10).toUpperCase() }));
      await t.prisma.user.createMany({ data: users });
      await t.prisma.address.createMany({ data: users.map((u) => ({ userId: u.id, cityId: bulkCity, line1: '1 Bulk Rd', label: 'Home', lat: 31.5, lng: 74.3 })) });
    });

    it('spreads SMS over time: never more than the SMS rate in any one second', async () => {
      const created = (await post('/admin/announcements', { title: 'Big', body: 'Many', segment: { cityId: bulkCity }, channels: ['SMS'], confirmRecipients: PEOPLE }).expect(202)).body.data;
      await queue.obliterate({ force: true });
      await fanout.run(created.id);
      const jobs = await pending();
      expect(jobs).toHaveLength(PEOPLE);
      const perSecond = new Map<number, number>();
      for (const j of jobs) perSecond.set(j.opts.delay ?? 0, (perSecond.get(j.opts.delay ?? 0) ?? 0) + 1);
      expect([...perSecond.entries()].sort((a, b) => a[0] - b[0])).toEqual([[0, SEND_RATE_PER_SEC.SMS], [1000, SEND_RATE_PER_SEC.SMS], [2000, PEOPLE - 2 * SEND_RATE_PER_SEC.SMS]]);
      expect(Math.max(...perSecond.values())).toBeLessThanOrEqual(SEND_RATE_PER_SEC.SMS);
    });

    it('limits each channel on its own', async () => {
      await t.prisma.user.updateMany({ where: { addresses: { some: { cityId: bulkCity } } }, data: { email: null } });
      const users = await t.prisma.user.findMany({ where: { addresses: { some: { cityId: bulkCity } } }, select: { id: true } });
      await Promise.all(users.slice(0, 15).map((u, i) => t.prisma.user.update({ where: { id: u.id }, data: { email: `bulk${i}-${randomUUID().slice(0, 4)}@announce.test` } })));
      const created = (await post('/admin/announcements', { title: 'Mail', body: 'Text', segment: { cityId: bulkCity }, channels: ['SMS', 'EMAIL'], confirmRecipients: PEOPLE }).expect(202)).body.data;
      await queue.obliterate({ force: true });
      await fanout.run(created.id);
      const jobs = await pending();
      const delays = (name: string) => jobs.filter((j) => j.name === name).map((j) => j.opts.delay ?? 0);
      expect(delays('send-sms')).toHaveLength(PEOPLE);
      expect(delays('send-email')).toHaveLength(15);
      const emailPerSecond = delays('send-email').reduce((m, d) => m.set(d, (m.get(d) ?? 0) + 1), new Map<number, number>());
      expect(Math.max(...emailPerSecond.values())).toBeLessThanOrEqual(SEND_RATE_PER_SEC.EMAIL);
      expect(Math.max(...delays('send-email'))).toBe(1000); // 15 emails at 10/s: two seconds
    });
  });

  describe('history', () => {
    it('lists newest first with a cursor and opens one by id', async () => {
      const other = await createAdmin(t);
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        clock.set(new Date(NOW.getTime() + i * 1000));
        ids.push((await post('/admin/announcements', { title: `N${i}`, body: 'b', segment: segment({ roles: ['CUSTOMER'] }), confirmRecipients: 3 }, other.auth).expect(202)).body.data.id);
      }
      const first = await get('/admin/announcements?limit=2').expect(200);
      expect(first.body.data.map((a: { id: string }) => a.id)).toEqual([ids[2], ids[1]]);
      const next = await get(`/admin/announcements?limit=2&cursor=${first.body.meta.nextCursor}`).expect(200);
      expect(next.body.data[0].id).toBe(ids[0]);
      await get(`/admin/announcements/${ids[0]}`).expect(200);
      await get(`/admin/announcements/${randomUUID()}`).expect(404);
      await get('/admin/announcements/nope').expect(400);
    });
  });

  describe('access', () => {
    it('is for admins only', async () => {
      const customer = await createCustomer(t);
      for (const [method, path] of [['get', '/admin/announcements'], ['post', '/admin/announcements'], ['post', '/admin/announcements/preview'], ['get', `/admin/announcements/${randomUUID()}`]] as const) {
        await http[method](`/api/v1${path}`).expect(401);
        await http[method](`/api/v1${path}`).set(customer.auth).expect(403);
      }
    });
  });
});
