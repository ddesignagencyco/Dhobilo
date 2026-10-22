import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { MailService } from '../src/infra/mail/mail.service';
import { PUSH_PROVIDER } from '../src/infra/push/push.provider';
import { QUEUES } from '../src/infra/queue/queues';
import { SMS_PROVIDER } from '../src/infra/sms/sms.provider';
import { WHATSAPP_PROVIDER } from '../src/infra/whatsapp/whatsapp.provider';
import { NotificationsWorkerModule } from '../src/modules/notifications/notifications-worker.module';
import { OrderTimersModule } from '../src/modules/orders/timers/order-timers.module';
import { OrderTimersProcessor, SWEEP_OVERDUE_JOB, TIMEOUT_REASON, VENDOR_TIMEOUT_JOB, vendorTimeoutJobId } from '../src/modules/orders/timers/order-timers.processor';
import { OrderTimersBootstrap, SWEEP_EVERY_MS } from '../src/modules/orders/timers/order-timers.bootstrap';
import { Basics, NOW, TestApp, clearRateLimits, createTestApp, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, orderScenario, placeOrder, waitFor } from './order-helpers';

describe('Order timers and notification delivery (e2e, with the worker running)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let timers: OrderTimersProcessor;
  let timerQueue: Queue;
  let notifQueue: Queue;

  const whatsapp = { send: jest.fn() };
  const sms = { send: jest.fn() };
  const mail = { send: jest.fn() };
  const push = { send: jest.fn() };

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({
      imports: [OrderTimersModule, NotificationsWorkerModule],
      customize: (b) =>
        b
          .overrideProvider(Clock).useValue(clock)
          .overrideProvider(WHATSAPP_PROVIDER).useValue(whatsapp)
          .overrideProvider(SMS_PROVIDER).useValue(sms)
          .overrideProvider(PUSH_PROVIDER).useValue(push)
          .overrideProvider(MailService).useValue(mail),
    });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    timers = t.app.get(OrderTimersProcessor);
    timerQueue = t.app.get(getQueueToken(QUEUES.ORDER_TIMERS));
    notifQueue = t.app.get(getQueueToken(QUEUES.NOTIFICATIONS));
  });
  beforeEach(async () => {
    clock.set(NOW);
    jest.clearAllMocks();
    whatsapp.send.mockResolvedValue(undefined);
    sms.send.mockResolvedValue(undefined);
    mail.send.mockResolvedValue({ messageId: 'm' });
    push.send.mockResolvedValue({ ok: true });
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterAll(() => t.close());

  const scenario = async () => {
    const s = await orderScenario(t, basics, { respondWithinMin: 15 });
    await t.prisma.user.update({ where: { id: s.vendor.owner.user.id }, data: { email: `o-${s.vendor.owner.user.id.slice(0, 8)}@vendors.test` } });
    return s;
  };
  const status = async (id: string) => (await t.prisma.order.findUniqueOrThrow({ where: { id } })).status;
  const history = (id: string) => t.prisma.orderStatusHistory.findMany({ where: { orderId: id }, orderBy: { seq: 'asc' } });
  const pastDeadline = () => clock.set(new Date(NOW.getTime() + 16 * 60_000));
  const accept = (s: OrderScenario, id: string) => http.post(`/api/v1/vendor/orders/${id}/accept`).set(s.vendor.owner.auth);

  describe('vendor response timeout', () => {
    it('schedules one delayed timer per placed order, keyed by order id', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      const job = await timerQueue.getJob(vendorTimeoutJobId(o.id));
      expect(job).toBeDefined();
      expect(job!.name).toBe(VENDOR_TIMEOUT_JOB);
      expect(job!.data).toMatchObject({ orderId: o.id });
      expect(job!.opts.delay).toBe(15 * 60_000); // the vendor's respondWithinMin
    });

    it('answering the order cancels its timer', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      await accept(s, o.id).expect(200);
      expect(await timerQueue.getJob(vendorTimeoutJobId(o.id))).toBeUndefined();
    });

    it('does nothing before the deadline (and a job firing a hair early leaves it to the sweeper)', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      expect(await timers.expireIfOverdue(o.id)).toBe(false);
      clock.set(new Date(NOW.getTime() + 15 * 60_000 - 5_000)); // 5 s before the deadline
      expect(await timers.expireIfOverdue(o.id)).toBe(false);
      expect(await status(o.id)).toBe('PLACED');
      clock.set(new Date(NOW.getTime() + 15 * 60_000 - 500)); // within the 1 s tolerance
      expect(await timers.expireIfOverdue(o.id)).toBe(true);
    });

    it('rejects an unanswered order as the system, with the standard reason, and frees the slot', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      pastDeadline();
      expect(await timers.expireIfOverdue(o.id)).toBe(true);

      const row = await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      expect(row).toMatchObject({ status: 'REJECTED', rejectionReason: TIMEOUT_REASON });
      expect((await history(o.id)).at(-1)).toMatchObject({ fromStatus: 'PLACED', toStatus: 'REJECTED', actorId: null, actorRole: null, note: TIMEOUT_REASON });
      const customerView = (await http.get(`/api/v1/orders/${o.id}`).set(s.customer.auth).expect(200)).body.data;
      expect(customerView).toMatchObject({ status: 'REJECTED', rejectionReason: TIMEOUT_REASON });
    });

    it('is idempotent: a second run, or a late job after the vendor answered, does nothing', async () => {
      const s = await scenario();
      const timedOut = await placeOrder(http, s);
      const answered = await placeOrder(http, s);
      await accept(s, answered.id).expect(200);
      pastDeadline();

      expect(await timers.expireIfOverdue(timedOut.id)).toBe(true);
      expect(await timers.expireIfOverdue(timedOut.id)).toBe(false);
      expect(await history(timedOut.id)).toHaveLength(2);

      expect(await timers.expireIfOverdue(answered.id)).toBe(false);
      expect(await status(answered.id)).toBe('ACCEPTED');
      expect(await timers.expireIfOverdue('00000000-0000-4000-8000-000000000000')).toBe(false);
    });

    it('the queued job really is picked up by the worker and expires the order', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      pastDeadline();
      await timerQueue.add(VENDOR_TIMEOUT_JOB, { orderId: o.id }, { removeOnComplete: true });
      await waitFor(async () => (await status(o.id)) === 'REJECTED', 8000, 'the worker to expire the order');
    });

    it('vendor accepting at the same moment as the timer: one outcome, consistent history', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      pastDeadline();
      await Promise.all([accept(s, o.id), timers.expireIfOverdue(o.id)]);
      expect(['ACCEPTED', 'REJECTED']).toContain(await status(o.id));
      expect(await history(o.id)).toHaveLength(2);
    });

    it('notifies the customer of the rejection and the vendor that the order expired', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      pastDeadline();
      await timers.expireIfOverdue(o.id);
      const templates = async (userId: string) =>
        (await t.prisma.notification.findMany({ where: { userId, payload: { path: ['data', 'orderId'], equals: o.id } } })).map((n) => n.template);
      expect(await templates(s.customer.user.id)).toContain('order_rejected');
      expect(await templates(s.vendor.owner.user.id)).toContain('vendor_order_expired');
      const rejected = await t.prisma.notification.findFirstOrThrow({ where: { userId: s.customer.user.id, template: 'order_rejected' } });
      expect((rejected.payload as { body: string }).body).toContain(TIMEOUT_REASON);
    });
  });

  describe('sweeper (safety net for lost timers)', () => {
    it('expires every overdue waiting order even when its delayed job is gone, and nothing else', async () => {
      const s = await scenario();
      const overdueA = await placeOrder(http, s);
      const overdueB = await placeOrder(http, s);
      const answered = await placeOrder(http, s);
      await accept(s, answered.id).expect(200);
      for (const o of [overdueA, overdueB]) await timerQueue.remove(vendorTimeoutJobId(o.id)); // simulate a Redis flush
      await t.prisma.order.updateMany({ where: { id: { in: [overdueA.id, overdueB.id] } }, data: { vendorRespondBy: new Date(NOW.getTime() - 60_000) } });
      const notYet = await placeOrder(http, s);

      expect(await timers.sweep()).toBe(2);
      expect(await status(overdueA.id)).toBe('REJECTED');
      expect(await status(overdueB.id)).toBe('REJECTED');
      expect(await status(answered.id)).toBe('ACCEPTED');
      expect(await status(notYet.id)).toBe('PLACED');
      expect(await timers.sweep()).toBe(0); // nothing left to do
    });

    it('is also reachable as a queue job, and unknown jobs fail loudly', async () => {
      const s = await scenario();
      const o = await placeOrder(http, s);
      await t.prisma.order.update({ where: { id: o.id }, data: { vendorRespondBy: new Date(NOW.getTime() - 1000) } });
      const result = await timers.process({ name: SWEEP_OVERDUE_JOB, data: undefined } as never);
      expect((result as { expired: number }).expired).toBeGreaterThanOrEqual(1);
      expect(await status(o.id)).toBe('REJECTED');
      await expect(timers.process({ name: 'nonsense', data: {} } as never)).rejects.toThrow(/No handler/);
    });

    it('registers itself to run every minute, safely repeatable by every worker', async () => {
      const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
      await new OrderTimersBootstrap({ upsertJobScheduler } as never).onApplicationBootstrap();
      expect(upsertJobScheduler).toHaveBeenCalledWith(SWEEP_OVERDUE_JOB, { every: SWEEP_EVERY_MS }, expect.objectContaining({ name: SWEEP_OVERDUE_JOB }));
      expect(SWEEP_EVERY_MS).toBe(60_000);
    });
  });

  describe('delivery through the worker', () => {
    it('sends WhatsApp, email and push for a new order and marks each log row SENT', async () => {
      const s = await scenario();
      await t.prisma.deviceToken.create({ data: { userId: s.customer.user.id, token: `device-${s.customer.user.id}-aaaa`, platform: 'android' } });
      const o = await placeOrder(http, s);

      const sent = await waitFor(async () => {
        const list = await t.prisma.notification.findMany({ where: { payload: { path: ['data', 'orderId'], equals: o.id } } });
        return list.length === 4 && list.every((n) => n.status === 'SENT') ? list : null;
      }, 10_000, 'all notifications to be delivered');
      expect(sent.map((n) => n.channel).sort()).toEqual(['EMAIL', 'PUSH', 'WHATSAPP', 'WHATSAPP']);
      expect(sent.every((n) => n.attempts === 1 && n.sentAt && n.error === null)).toBe(true);

      expect(whatsapp.send).toHaveBeenCalledWith(expect.objectContaining({ to: s.customer.user.phone, templateName: 'order_placed_en', language: 'en', params: [o.orderNo, s.vendor.vendor.businessName] }));
      expect(whatsapp.send).toHaveBeenCalledWith(expect.objectContaining({ to: s.vendor.owner.user.phone, templateName: 'vendor_new_order_en' }));
      expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ subject: 'New order', text: expect.stringContaining(o.orderNo) }));
      expect(push.send).toHaveBeenCalledWith(`device-${s.customer.user.id}-aaaa`, expect.objectContaining({ title: 'Order placed', data: expect.objectContaining({ orderId: o.id }) }));
    });

    it('deletes a dead device token as soon as the provider reports it, but still delivers to good ones', async () => {
      const s = await scenario();
      const good = `good-${s.customer.user.id}-xxxxxxxx`;
      const dead = `invalid-${s.customer.user.id}-xxxx`;
      await t.prisma.deviceToken.createMany({ data: [{ userId: s.customer.user.id, token: good, platform: 'android' }, { userId: s.customer.user.id, token: dead, platform: 'web' }] });
      push.send.mockImplementation(async (token: string) => (token === dead ? { ok: false, invalidToken: true, error: 'UNREGISTERED' } : { ok: true }));
      const o = await placeOrder(http, s);

      await waitFor(async () => (await t.prisma.notification.findFirst({ where: { userId: s.customer.user.id, channel: 'PUSH', status: 'SENT', payload: { path: ['data', 'orderId'], equals: o.id } } })) ?? null, 10_000, 'push to be delivered');
      expect(await t.prisma.deviceToken.findMany({ where: { userId: s.customer.user.id } })).toEqual([expect.objectContaining({ token: good })]);
    });

    it('a user whose every device is dead is not retried: FAILED at once and the tokens are cleaned up', async () => {
      const s = await scenario();
      const tokens = [`invalid-${s.customer.user.id}-aaaaaaaa`, `invalid-${s.customer.user.id}-bbbbbbbb`];
      await t.prisma.deviceToken.createMany({ data: tokens.map((token) => ({ userId: s.customer.user.id, token, platform: 'android' as const })) });
      push.send.mockResolvedValue({ ok: false, invalidToken: true, error: 'UNREGISTERED' });
      const o = await placeOrder(http, s);
      const failed = await waitFor(async () => (await t.prisma.notification.findFirst({ where: { userId: s.customer.user.id, channel: 'PUSH', status: 'FAILED', payload: { path: ['data', 'orderId'], equals: o.id } } })) ?? null, 10_000, 'push to fail');
      expect(failed.attempts).toBe(1);
      expect(await t.prisma.deviceToken.count({ where: { userId: s.customer.user.id } })).toBe(0);
    });

    it('after WhatsApp finally fails the same text goes out by SMS, each with its own log row', async () => {
      const s = await scenario();
      const row = await t.prisma.notification.create({ data: { userId: s.customer.user.id, channel: 'WHATSAPP', template: 'order_accepted', payload: { title: 'x', body: 'Your order DHB-1 was accepted.', data: {} }, status: 'QUEUED' } });
      whatsapp.send.mockRejectedValue(new Error('BSP unreachable'));
      await notifQueue.add(
        'send-whatsapp',
        { notificationId: row.id, userId: s.customer.user.id, to: s.customer.user.phone, templateName: 'order_accepted_en', language: 'en', params: ['DHB-1'], fallbackText: 'Your order DHB-1 was accepted.', fallbackSms: true },
        { attempts: 1 }, // no retries, so the first failure is the final one
      );

      await waitFor(async () => (sms.send.mock.calls.length > 0 ? true : null), 10_000, 'the SMS fallback');
      expect(sms.send).toHaveBeenCalledWith(s.customer.user.phone, 'Your order DHB-1 was accepted.');
      const failed = await t.prisma.notification.findUniqueOrThrow({ where: { id: row.id } });
      expect(failed).toMatchObject({ status: 'FAILED', attempts: 1 });
      expect(failed.error).toContain('BSP unreachable');
      const smsRow = await waitFor(async () => (await t.prisma.notification.findFirst({ where: { userId: s.customer.user.id, channel: 'SMS', status: 'SENT' } })) ?? null, 10_000, 'the SMS log row');
      expect(smsRow.template).toBe('whatsapp_fallback');
    });
  });
});
