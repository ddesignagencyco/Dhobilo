import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import { QUEUES } from '../src/infra/queue/queues';
import { Clock } from '../src/common/time/clock';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createTestApp, createUserWithToken, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, orderScenario, placeOrder } from './order-helpers';

type Row = { channel: string; template: string; status: string; userId: string; payload: { title: string; body: string; data: Record<string, string> } };

describe('Order notifications (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let queue: Queue;
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    const clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    queue = t.app.get(getQueueToken(QUEUES.NOTIFICATIONS));
  });
  beforeEach(async () => {
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterAll(() => t.close());

  /** A scenario where the owner has an email address, so every channel can be exercised. */
  async function scenario() {
    const s = await orderScenario(t, basics);
    await t.prisma.user.update({ where: { id: s.vendor.owner.user.id }, data: { email: `owner-${s.vendor.owner.user.id.slice(0, 8)}@vendors.test` } });
    return s;
  }
  const rows = async (orderId: string): Promise<Row[]> =>
    (await t.prisma.notification.findMany({ where: { payload: { path: ['data', 'orderId'], equals: orderId } }, orderBy: { createdAt: 'asc' } })) as unknown as Row[];
  const forUser = (list: Row[], userId: string) => list.filter((r) => r.userId === userId);
  const vendorPost = (s: OrderScenario, id: string, action: string, body: object = {}) => http.post(`/api/v1/vendor/orders/${id}/${action}`).set(s.vendor.owner.auth).send(body);
  const queuedJobs = async () => queue.getJobs(['waiting', 'delayed', 'active']);

  describe('when an order is placed', () => {
    it('confirms to the customer on WhatsApp and alerts the vendor owner on WhatsApp and email, logging each', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      const all = await rows(o.id);

      const customer = forUser(all, s.customer.user.id);
      expect(customer.map((r) => [r.channel, r.template])).toEqual([['WHATSAPP', 'order_placed']]);
      expect(customer[0].payload.body).toBe(`Your order ${o.orderNo} was sent to ${s.vendor.vendor.businessName}. Waiting for them to confirm.`);
      expect(customer[0].status).toBe('QUEUED');

      const owner = forUser(all, s.vendor.owner.user.id);
      expect(owner.map((r) => r.channel).sort()).toEqual(['EMAIL', 'WHATSAPP']);
      expect(owner.every((r) => r.template === 'vendor_new_order')).toBe(true);
      expect(owner[0].payload.body).toBe(`New order ${o.orderNo}: 1 item(s), Rs 350.00. Please respond within 15 min.`);
      expect(owner[0].payload.data).toMatchObject({ orderId: o.id, type: 'ORDER_PLACED' });

      // the log never stores phone numbers or tokens
      expect(JSON.stringify(all)).not.toContain(s.customer.user.phone);
    });

    it('queues one delivery job per log row, carrying what the worker needs', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      const all = await t.prisma.notification.findMany({ where: { payload: { path: ['data', 'orderId'], equals: o.id } } });
      const jobs = await queuedJobs();
      for (const row of all) {
        const job = jobs.find((j) => j.data.notificationId === row.id);
        expect({ row: row.channel, queued: !!job }).toEqual({ row: row.channel, queued: true });
        expect(job!.name).toBe({ WHATSAPP: 'send-whatsapp', EMAIL: 'send-email', SMS: 'send-sms', PUSH: 'send-push' }[row.channel]);
      }
      const wa = jobs.find((j) => j.name === 'send-whatsapp' && j.data.userId === s.customer.user.id)!;
      expect(wa.data).toMatchObject({ to: s.customer.user.phone, templateName: 'order_placed_en', language: 'en', fallbackSms: true, params: [o.orderNo, s.vendor.vendor.businessName] });
      const email = jobs.find((j) => j.name === 'send-email' && j.data.to.includes('owner-'))!;
      expect(email.data).toMatchObject({ subject: 'New order', text: expect.stringContaining(o.orderNo) });
    });

    it('adds push for everyone with a registered device; vendor staff get push only', async () => {
      const s = await scenario();
      const staff = await createUserWithToken(t, 'VENDOR_STAFF');
      await t.prisma.vendorStaff.create({ data: { vendorId: s.vendor.vendor.id, userId: staff.user.id } });
      await t.prisma.deviceToken.createMany({
        data: [
          { userId: s.customer.user.id, token: `cust-token-${s.customer.user.id}`, platform: 'android' },
          { userId: s.customer.user.id, token: `cust-token-2-${s.customer.user.id}`, platform: 'web' },
          { userId: staff.user.id, token: `staff-token-${staff.user.id}`, platform: 'android' },
        ],
      });
      const o = await placeOrder(http, s);
      const all = await rows(o.id);

      expect(forUser(all, s.customer.user.id).map((r) => r.channel).sort()).toEqual(['PUSH', 'WHATSAPP']);
      expect(forUser(all, staff.user.id).map((r) => r.channel)).toEqual(['PUSH']);
      expect(forUser(all, s.vendor.owner.user.id).map((r) => r.channel).sort()).toEqual(['EMAIL', 'WHATSAPP']); // owner has no device

      const push = (await queuedJobs()).find((j) => j.name === 'send-push' && j.data.tokens.length === 2)!;
      expect(push.data).toMatchObject({ title: 'Order placed', data: { orderId: o.id, type: 'ORDER_PLACED' } });
      expect(push.data.tokens).toHaveLength(2);
    });

    it('uses the recipient’s own language', async () => {
      const s = await scenario();
      await t.prisma.user.update({ where: { id: s.customer.user.id }, data: { locale: 'UR' } });
      const o = await placeOrder(http, s);
      const customer = forUser(await rows(o.id), s.customer.user.id)[0];
      expect(customer.payload.title).toBe('آرڈر بھیج دیا گیا');
      expect(customer.payload.body).toContain(o.orderNo);
      expect(customer.payload.body).toMatch(/[؀-ۿ]/);
      const job = (await queuedJobs()).find((j) => j.data.userId === s.customer.user.id && j.name === 'send-whatsapp' && j.data.params[0] === o.orderNo)!;
      expect(job.data).toMatchObject({ language: 'ur', templateName: 'order_placed_ur' });
      // the vendor owner still gets English
      expect(forUser(await rows(o.id), s.vendor.owner.user.id)[0].payload.body).toMatch(/^New order/);
    });
  });

  describe('channel preferences', () => {
    it('WhatsApp off -> SMS instead; both off -> no text message at all', async () => {
      const s = await scenario();
      await t.prisma.user.update({ where: { id: s.customer.user.id }, data: { notificationPrefs: { whatsapp: false } } });
      const a = await placeOrder(http, s);
      expect(forUser(await rows(a.id), s.customer.user.id).map((r) => r.channel)).toEqual(['SMS']);
      const sms = (await queuedJobs()).find((j) => j.name === 'send-sms' && j.data.to === s.customer.user.phone && j.data.message.includes(a.orderNo))!;
      expect(sms.data.message).toContain(a.orderNo);

      await t.prisma.user.update({ where: { id: s.customer.user.id }, data: { notificationPrefs: { whatsapp: false, sms: false } } });
      const b = await placeOrder(http, s);
      expect(forUser(await rows(b.id), s.customer.user.id)).toEqual([]);
    });

    it('push off, and vendor email off, are respected', async () => {
      const s = await scenario();
      await t.prisma.deviceToken.create({ data: { userId: s.customer.user.id, token: `tok-${s.customer.user.id}-xxxxxxxxxx`, platform: 'web' } });
      await t.prisma.user.update({ where: { id: s.customer.user.id }, data: { notificationPrefs: { push: false } } });
      await t.prisma.user.update({ where: { id: s.vendor.owner.user.id }, data: { notificationPrefs: { email: false } } });
      const o = await placeOrder(http, s);
      const all = await rows(o.id);
      expect(forUser(all, s.customer.user.id).map((r) => r.channel)).toEqual(['WHATSAPP']);
      expect(forUser(all, s.vendor.owner.user.id).map((r) => r.channel)).toEqual(['WHATSAPP']);
    });

    it('a WhatsApp job tells the worker whether SMS is an allowed fallback', async () => {
      const s = await scenario();
      await t.prisma.user.update({ where: { id: s.customer.user.id }, data: { notificationPrefs: { sms: false } } });
      const o = await placeOrder(http, s);
      const job = (await queuedJobs()).find((j) => j.name === 'send-whatsapp' && j.data.params[0] === o.orderNo && j.data.userId === s.customer.user.id)!;
      expect(job.data.fallbackSms).toBe(false);
    });

    it('users can read and change their preferences through the API', async () => {
      const { auth } = await createUserWithToken(t, 'CUSTOMER');
      expect((await http.get('/api/v1/me/notification-preferences').set(auth).expect(200)).body.data).toEqual({ push: true, whatsapp: true, sms: true, email: true });
      const res = await http.patch('/api/v1/me/notification-preferences').set(auth).send({ whatsapp: false }).expect(200);
      expect(res.body.data).toEqual({ push: true, whatsapp: false, sms: true, email: true });
      await http.patch('/api/v1/me/notification-preferences').set(auth).send({ sms: false }).expect(200);
      expect((await http.get('/api/v1/me/notification-preferences').set(auth)).body.data).toEqual({ push: true, whatsapp: false, sms: false, email: true });
      for (const bad of [{ push: 'yes' }, { whatsapp: 1 }, { telegram: true }]) {
        await http.patch('/api/v1/me/notification-preferences').set(auth).send(bad).expect(400);
      }
      await http.get('/api/v1/me/notification-preferences').expect(401);
    });
  });

  describe('as the order moves', () => {
    it('tells the customer at every step, and not the vendor about its own actions', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      await vendorPost(s, o.id, 'accept').expect(200);
      for (const status of ['PICKED_UP', 'IN_PROCESS', 'READY', 'OUT_FOR_DELIVERY']) await vendorPost(s, o.id, 'status', { status }).expect(200);

      const all = await rows(o.id);
      expect(forUser(all, s.customer.user.id).map((r) => r.template)).toEqual([
        'order_placed',
        'order_accepted',
        'order_picked_up',
        'order_in_process',
        'order_ready',
        'order_out_for_delivery',
      ]);
      expect(forUser(all, s.vendor.owner.user.id).map((r) => r.template).filter((x) => x !== 'vendor_new_order')).toEqual([]);
      const accepted = forUser(all, s.customer.user.id)[1];
      expect(accepted.payload.body).toBe(`${s.vendor.vendor.businessName} accepted your order ${o.orderNo}.`);
      expect(accepted.payload.data).toMatchObject({ orderId: o.id, status: 'ACCEPTED', type: 'ORDER_STATUS' });
    });

    it('a vendor rejection tells the customer why', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      await vendorPost(s, o.id, 'reject', { reason: 'We are fully booked this week.' }).expect(200);
      const all = await rows(o.id);
      const rejected = forUser(all, s.customer.user.id).find((r) => r.template === 'order_rejected')!;
      expect(rejected.payload.body).toBe(`Sorry, ${s.vendor.vendor.businessName} could not take your order ${o.orderNo}. We are fully booked this week.`);
      expect(forUser(all, s.vendor.owner.user.id).map((r) => r.template)).not.toContain('vendor_order_expired');
    });

    it('a customer cancellation tells the vendor (and everyone on staff) but not the customer again', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      const before = (await rows(o.id)).length;
      await http.post(`/api/v1/orders/${o.id}/cancel`).set(s.customer.auth).send({ reason: 'Changed plans' }).expect(200);
      const added = (await rows(o.id)).slice(before);
      expect(added.every((r) => r.userId === s.vendor.owner.user.id)).toBe(true);
      expect(added.map((r) => r.template)).toEqual(expect.arrayContaining(['vendor_order_cancelled']));
      expect(added.find((r) => r.channel === 'WHATSAPP')!.payload.body).toBe(`Order ${o.orderNo} was cancelled. Changed plans`);
    });

    it('an admin cancellation tells both sides, with the admin’s reason', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      const before = (await rows(o.id)).length;
      await http.post(`/api/v1/admin/orders/${o.id}/cancel`).set(admin.auth).send({ reason: 'Duplicate order, cancelled by support.' }).expect(200);
      const added = (await rows(o.id)).slice(before);
      expect(added.filter((r) => r.userId === s.customer.user.id).map((r) => r.template)).toEqual(['order_cancelled']);
      expect(added.filter((r) => r.userId === s.vendor.owner.user.id).map((r) => r.template)).toEqual(expect.arrayContaining(['vendor_order_cancelled']));
      expect(added.every((r) => r.payload.body.includes('Duplicate order, cancelled by support.'))).toBe(true);
    });
  });

  describe('resilience', () => {
    it('a notification problem never breaks the order flow: the change stands and the failure is recorded', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      const spy = jest.spyOn(queue, 'add').mockRejectedValue(new Error('redis is having a moment'));
      try {
        await vendorPost(s, o.id, 'accept').expect(200);
      } finally {
        spy.mockRestore();
      }
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('ACCEPTED');
      const accepted = (await rows(o.id)).find((r) => r.template === 'order_accepted');
      expect(accepted).toMatchObject({ status: 'FAILED' });
      const full = await t.prisma.notification.findFirstOrThrow({ where: { template: 'order_accepted', payload: { path: ['data', 'orderId'], equals: o.id } } });
      expect(full.error).toContain('redis is having a moment');
    });

    it('placing an order still succeeds if building notifications fails outright', async () => {
      const s = await scenario();
      const spy = jest.spyOn(t.prisma.notification, 'create').mockRejectedValue(new Error('db hiccup'));
      try {
        const o = await placeOrder(http, s);
        expect(o.status).toBe('PLACED');
      } finally {
        spy.mockRestore();
      }
    });
  });
});
