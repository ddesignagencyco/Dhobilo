import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { OpsAlertService } from '../src/modules/delivery/ops-alert.service';
import { MOCK_SIGNATURE_HEADER, MockGateway, mockSignature } from '../src/modules/payments/gateway/mock.gateway';
import { PaymentsScheduler } from '../src/modules/payments/payments.scheduler';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createCustomer, createTestApp, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, orderScenario, placeOrder } from './order-helpers';

const SECRET = 'test-payment-mock-secret';

describe('Online payments (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let payments: PaymentsService;
  let gateway: MockGateway;
  let alert: jest.SpyInstance;
  let queueRefund: jest.SpyInstance;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    payments = t.app.get(PaymentsService);
    gateway = t.app.get(MockGateway);
    alert = jest.spyOn(OpsAlertService.prototype, 'alert').mockResolvedValue(undefined);
    queueRefund = jest.spyOn(t.app.get(PaymentsScheduler), 'refund');
  });
  beforeEach(async () => {
    clock.set(NOW);
    alert.mockClear();
    queueRefund.mockClear();
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterAll(() => t.close());

  const scenario = () => orderScenario(t, basics);
  const placeOnline = (s: OrderScenario, method = 'CARD', extra: Record<string, unknown> = {}) => placeOrder(http, s, { paymentMethod: method, ...extra });
  type Placed = Awaited<ReturnType<typeof placeOnline>>;

  const attempts = (orderId: string) => t.prisma.payment.findMany({ where: { orderId }, orderBy: { attempt: 'asc' } });
  const latest = async (orderId: string) => (await attempts(orderId)).at(-1)!;
  const orderRow = (id: string) => t.prisma.order.findUniqueOrThrow({ where: { id } });

  /** A signed notification from the (fake) gateway, delivered to the webhook exactly as a real one would be. */
  const notify = (gatewayRef: string, status: 'PAID' | 'FAILED', extra: { eventId?: string; amount?: string; sign?: boolean } = {}) => {
    const body = JSON.stringify({ eventId: extra.eventId ?? `evt-${randomUUID()}`, gatewayRef, status, ...(extra.amount ? { amount: extra.amount } : {}) });
    return http.post('/api/v1/payments/webhooks/mock').set('content-type', 'application/json').set(MOCK_SIGNATURE_HEADER, extra.sign === false ? 'bad' : mockSignature(SECRET, body)).send(body);
  };
  /** What the worker does: apply every notification that has been stored. */
  const processAll = async () => {
    for (const e of await t.prisma.paymentEvent.findMany({ where: { processedAt: null }, orderBy: { createdAt: 'asc' } })) await payments.processEvent(e.id);
  };
  const pay = async (order: Placed, amount = '350.00') => {
    const p = await latest(order.id);
    await notify(p.gatewayRef!, 'PAID', { amount }).expect(200);
    await processAll();
  };
  const vendorNotices = (s: OrderScenario) => t.prisma.notification.count({ where: { userId: s.vendor.owner.user.id, template: 'vendor_new_order' } });
  const vendorSees = async (s: OrderScenario, id: string) => {
    const list = await http.get('/api/v1/vendor/orders?status=PLACED').set(s.vendor.owner.auth).expect(200);
    return (list.body.data as { id: string }[]).some((o) => o.id === id);
  };

  describe('choosing how to pay', () => {
    it('lists the methods that can be used, each with a short explanation and no fee', async () => {
      const res = await http.get('/api/v1/payments/methods').expect(200);
      expect(res.body.data.map((m: { method: string }) => m.method)).toEqual(['COD', 'CARD', 'JAZZCASH', 'EASYPAISA', 'RAAST']);
      expect(res.body.data[0]).toMatchObject({ method: 'COD', online: false, fee: '0.00', currency: 'PKR', label: expect.any(String), instructions: expect.any(String) });
      expect(res.body.data[1]).toMatchObject({ method: 'CARD', online: true });
    });
  });

  describe('placing an online order', () => {
    it('creates a pending order with a checkout link, and keeps it away from the vendor until it is paid', async () => {
      const s = await scenario();
      const res = await http.post('/api/v1/orders').set(s.customer.auth).set('Idempotency-Key', randomUUID()).send(body(s, 'CARD')).expect(201);
      const order = res.body.data;
      expect(order).toMatchObject({ status: 'PLACED', paymentMethod: 'CARD', paymentStatus: 'PENDING' });
      expect(order.payment).toMatchObject({ method: 'CARD', status: 'PENDING', attempt: 1, amount: '350.00', currency: 'PKR', checkout: { method: 'GET', redirectUrl: expect.stringContaining('/api/v1/dev/mock-gateway/MOCKPAY-') } });
      expect(new Date(order.payment.expiresAt).getTime()).toBe(NOW.getTime() + 15 * 60_000);

      const row = await orderRow(order.id);
      expect(row.vendorVisibleAt).toBeNull();
      expect(await vendorSees(s, order.id)).toBe(false);
      expect((await http.get('/api/v1/vendor/orders/counts').set(s.vendor.owner.auth).expect(200)).body.data.PLACED).toBe(0);
      await http.get(`/api/v1/vendor/orders/${order.id}`).set(s.vendor.owner.auth).expect(404);
      await http.post(`/api/v1/vendor/orders/${order.id}/accept`).set(s.vendor.owner.auth).send({}).expect(404);
      expect(await vendorNotices(s)).toBe(0);
      expect(await t.prisma.notification.count({ where: { userId: s.customer.user.id, template: 'order_placed' } })).toBe(0); // told once paid
    });

    it('a cash order is unchanged: visible to the vendor at once, no checkout', async () => {
      const s = await scenario();
      const order = await placeOrder(http, s);
      const res = await http.get(`/api/v1/orders/${order.id}/payment`).set(s.customer.auth).expect(200);
      expect(res.body.data[0]).toMatchObject({ method: 'COD', status: 'COD_PENDING', checkout: null });
      expect(await vendorSees(s, order.id)).toBe(true);
      expect((await orderRow(order.id)).vendorVisibleAt).not.toBeNull();
    });

    it('a retried request with the same Idempotency-Key returns the same order and checkout, not a second payment', async () => {
      const s = await scenario();
      const key = randomUUID();
      const first = await http.post('/api/v1/orders').set(s.customer.auth).set('Idempotency-Key', key).send(body(s, 'JAZZCASH')).expect(201);
      const again = await http.post('/api/v1/orders').set(s.customer.auth).set('Idempotency-Key', key).send(body(s, 'JAZZCASH')).expect(200);
      expect(again.body.data.id).toBe(first.body.data.id);
      expect(again.body.data.payment.id).toBe(first.body.data.payment.id);
      expect(again.body.data.payment.checkout).toEqual(first.body.data.payment.checkout);
      expect(await attempts(first.body.data.id)).toHaveLength(1);
    });

    it('works for every online method', async () => {
      const s = await scenario();
      for (const method of ['CARD', 'JAZZCASH', 'EASYPAISA', 'RAAST']) {
        const order = await placeOnline(s, method);
        expect(await latest(order.id)).toMatchObject({ method, gateway: 'mock', status: 'PENDING' });
        await http.post(`/api/v1/orders/${order.id}/cancel`).set(s.customer.auth).send({}).expect(200);
      }
    });
  });

  describe('paying', () => {
    it('the fake hosted page pays: the gateway notifies us, and once applied the vendor hears about the order', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const p = await latest(order.id);

      const page = await http.get(`/api/v1/dev/mock-gateway/${p.gatewayRef}`).expect(200);
      expect(page.body.data).toMatchObject({ gatewayRef: p.gatewayRef, amount: '350.00', status: 'PENDING', orderNo: order.orderNo });
      const paid = await http.post(`/api/v1/dev/mock-gateway/${p.gatewayRef}/pay`).expect(200);
      expect(paid.body.data).toMatchObject({ outcome: 'PAID', notified: true });

      // Stored but not yet applied: the call returned before the worker did its part.
      expect((await latest(order.id)).status).toBe('PENDING');
      expect(await vendorSees(s, order.id)).toBe(false);

      await processAll();
      const after = await orderRow(order.id);
      expect(await latest(order.id)).toMatchObject({ status: 'PAID', failureReason: null });
      expect(after).toMatchObject({ paymentStatus: 'PAID', status: 'PLACED' });
      expect(after.vendorVisibleAt).toEqual(NOW);
      expect(after.vendorRespondBy).toEqual(new Date(NOW.getTime() + 15 * 60_000)); // the vendor's window starts now
      expect(await vendorSees(s, order.id)).toBe(true);
      expect(await vendorNotices(s)).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: s.customer.user.id, template: 'order_placed' } })).toBe(1);

      // and the vendor can work it as usual
      await http.post(`/api/v1/vendor/orders/${order.id}/accept`).set(s.vendor.owner.auth).send({}).expect(200);
    });

    it('a declined payment fails the attempt and the order stays hidden', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const p = await latest(order.id);
      await http.post(`/api/v1/dev/mock-gateway/${p.gatewayRef}/decline`).expect(200);
      await processAll();
      expect(await latest(order.id)).toMatchObject({ status: 'FAILED', failureReason: 'Declined on the mock gateway' });
      expect(await orderRow(order.id)).toMatchObject({ paymentStatus: 'FAILED', status: 'PLACED' });
      expect(await vendorSees(s, order.id)).toBe(false);
    });

    it('the payment screen shows every attempt, newest first, and the checkout only while one is pending', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const first = await latest(order.id);
      await notify(first.gatewayRef!, 'FAILED').expect(200);
      await processAll();
      const retry = await http.post(`/api/v1/orders/${order.id}/pay`).set(s.customer.auth).send({}).expect(200);
      expect(retry.body.data).toMatchObject({ attempt: 2, status: 'PENDING', checkout: { redirectUrl: expect.any(String) } });

      const list = await http.get(`/api/v1/orders/${order.id}/payment`).set(s.customer.auth).expect(200);
      expect(list.body.data.map((p: { attempt: number; status: string }) => [p.attempt, p.status])).toEqual([[2, 'PENDING'], [1, 'FAILED']]);
      expect(list.body.data[0].checkout).not.toBeNull();
      expect(list.body.data[1].checkout).toBeNull();
      expect(JSON.stringify(list.body)).not.toContain(SECRET);
    });
  });

  describe('retrying', () => {
    it('after a failure the customer can try again (even with another method), and the order is hidden until paid', async () => {
      const s = await scenario();
      const order = await placeOnline(s, 'CARD');
      await notify((await latest(order.id)).gatewayRef!, 'FAILED').expect(200);
      await processAll();

      const retry = await http.post(`/api/v1/orders/${order.id}/pay`).set(s.customer.auth).send({ method: 'RAAST' }).expect(200);
      expect(retry.body.data).toMatchObject({ method: 'RAAST', attempt: 2, status: 'PENDING' });
      expect(await orderRow(order.id)).toMatchObject({ paymentMethod: 'RAAST', paymentStatus: 'PENDING' });

      await pay(order);
      expect(await orderRow(order.id)).toMatchObject({ paymentStatus: 'PAID' });
      expect(await vendorSees(s, order.id)).toBe(true);
    });

    it('is refused for paid orders, cash orders, other customers’ orders and unknown ones', async () => {
      const s = await scenario();
      const paid = await placeOnline(s);
      await pay(paid);
      expect((await http.post(`/api/v1/orders/${paid.id}/pay`).set(s.customer.auth).send({}).expect(409)).body.error.code).toBe('PAYMENT_NOT_NEEDED');
      const cash = await placeOrder(http, s);
      expect((await http.post(`/api/v1/orders/${cash.id}/pay`).set(s.customer.auth).send({}).expect(409)).body.error.code).toBe('PAYMENT_NOT_NEEDED');

      const open = await placeOnline(s);
      const stranger = await createCustomer(t);
      await http.post(`/api/v1/orders/${open.id}/pay`).set(stranger.auth).send({}).expect(404);
      await http.get(`/api/v1/orders/${open.id}/payment`).set(stranger.auth).expect(404);
      await http.post('/api/v1/orders/00000000-0000-4000-8000-000000000000/pay').set(s.customer.auth).send({}).expect(404);
      expect((await http.post(`/api/v1/orders/${open.id}/pay`).set(s.customer.auth).send({ method: 'COD' }).expect(400)).body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    });

    it('allows at most five attempts per order', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      for (let i = 0; i < 4; i++) await http.post(`/api/v1/orders/${order.id}/pay`).set(s.customer.auth).send({}).expect(200);
      expect((await http.post(`/api/v1/orders/${order.id}/pay`).set(s.customer.auth).send({}).expect(409)).body.error.code).toBe('PAYMENT_ATTEMPTS_EXHAUSTED');
    });

    it('if an abandoned attempt turns out to be paid after a newer one was paid too, the extra payment is refunded', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const first = await latest(order.id);
      await http.post(`/api/v1/orders/${order.id}/pay`).set(s.customer.auth).send({}).expect(200);
      const second = await latest(order.id);
      expect((await attempts(order.id))[0].status).toBe('FAILED'); // superseded

      clock.set(new Date(NOW.getTime() + 1000));
      await notify(second.gatewayRef!, 'PAID', { amount: '350.00' }).expect(200);
      await processAll();
      clock.set(new Date(NOW.getTime() + 2000));
      await notify(first.gatewayRef!, 'PAID', { amount: '350.00' }).expect(200);
      await processAll();

      const [a1, a2] = await attempts(order.id);
      expect(a2.status).toBe('PAID');
      expect(a1).toMatchObject({ status: 'REFUNDED', refundRef: expect.stringMatching(/^MOCKREF-/) });
      expect(await orderRow(order.id)).toMatchObject({ paymentStatus: 'PAID' }); // still paid, once
      expect(await vendorNotices(s)).toBe(1);
    });
  });

  describe('notifications from the gateway', () => {
    it('are accepted only with a valid signature on the raw body', async () => {
      const s = await scenario();
      const ref = (await latest((await placeOnline(s)).id)).gatewayRef!;
      const raw = JSON.stringify({ eventId: 'evt-x', gatewayRef: ref, status: 'PAID', amount: '350.00' });

      await http.post('/api/v1/payments/webhooks/mock').set('content-type', 'application/json').send(raw).expect(401); // unsigned
      await http.post('/api/v1/payments/webhooks/mock').set('content-type', 'application/json').set(MOCK_SIGNATURE_HEADER, 'f'.repeat(64)).send(raw).expect(401);
      await http.post('/api/v1/payments/webhooks/mock').set('content-type', 'application/json').set(MOCK_SIGNATURE_HEADER, mockSignature('some-other-secret', raw)).send(raw).expect(401);
      // signed for one body, sent with another
      await http.post('/api/v1/payments/webhooks/mock').set('content-type', 'application/json').set(MOCK_SIGNATURE_HEADER, mockSignature(SECRET, raw)).send(raw.replace('350.00', '1.00')).expect(401);
      // a correct signature over rubbish is still rubbish
      const junk = '{"hello":"world"}';
      await http.post('/api/v1/payments/webhooks/mock').set('content-type', 'application/json').set(MOCK_SIGNATURE_HEADER, mockSignature(SECRET, junk)).send(junk).expect(401);
      await http.post('/api/v1/payments/webhooks/nobody').set('content-type', 'application/json').send(raw).expect(404);
      await http.post('/api/v1/payments/webhooks/jazzcash').set('content-type', 'application/json').send(raw).expect(404); // not configured here

      expect(await t.prisma.paymentEvent.count({ where: { gatewayRef: ref } })).toBe(0);
      expect((await latest((await t.prisma.payment.findFirstOrThrow({ where: { gatewayRef: ref } })).orderId)).status).toBe('PENDING');
    });

    it('answer quickly and are stored once: the same event id again is a harmless duplicate, even in parallel', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const ref = (await latest(order.id)).gatewayRef!;
      const eventId = 'evt-burst-1';

      const burst = await Promise.all(Array.from({ length: 10 }, () => notify(ref, 'PAID', { eventId, amount: '350.00' })));
      expect(burst.map((r) => r.status)).toEqual(Array(10).fill(200));
      expect(burst.filter((r) => r.body.data.duplicate === false)).toHaveLength(1);
      expect(await t.prisma.paymentEvent.count({ where: { gateway: 'mock', eventId } })).toBe(1);

      // and applying it in parallel changes things once
      const stored = await t.prisma.paymentEvent.findFirstOrThrow({ where: { eventId } });
      await Promise.all(Array.from({ length: 6 }, () => payments.processEvent(stored.id)));
      expect(await vendorNotices(s)).toBe(1);
      expect(await latest(order.id)).toMatchObject({ status: 'PAID' });
    });

    it('applied twice or with several event ids, a payment is still just paid once', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const ref = (await latest(order.id)).gatewayRef!;
      await notify(ref, 'PAID', { amount: '350.00' }).expect(200);
      await notify(ref, 'PAID', { amount: '350.00' }).expect(200);
      await processAll();
      await processAll();
      expect(await vendorNotices(s)).toBe(1);
      expect(await t.prisma.payment.count({ where: { orderId: order.id, status: 'PAID' } })).toBe(1);
      expect(await t.prisma.paymentEvent.count({ where: { gatewayRef: ref, processedAt: { not: null } } })).toBe(2);
    });

    it('out of order: a late failure never undoes a payment, and a late success still counts', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const ref = (await latest(order.id)).gatewayRef!;
      await notify(ref, 'PAID', { amount: '350.00' }).expect(200);
      await notify(ref, 'FAILED').expect(200); // arrives after, e.g. a retry from the gateway's queue
      await processAll();
      expect(await latest(order.id)).toMatchObject({ status: 'PAID' });
      expect(await orderRow(order.id)).toMatchObject({ paymentStatus: 'PAID' });

      const other = await placeOnline(s);
      const ref2 = (await latest(other.id)).gatewayRef!;
      await notify(ref2, 'FAILED').expect(200);
      await processAll();
      expect((await latest(other.id)).status).toBe('FAILED');
      await notify(ref2, 'PAID', { amount: '350.00' }).expect(200);
      await processAll();
      expect(await latest(other.id)).toMatchObject({ status: 'PAID', failureReason: null });
      expect(await vendorSees(s, other.id)).toBe(true);
    });

    it('for the wrong amount are not believed: the payment stays pending and ops is told', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const ref = (await latest(order.id)).gatewayRef!;
      await notify(ref, 'PAID', { amount: '1.00' }).expect(200);
      await processAll();
      expect(await latest(order.id)).toMatchObject({ status: 'PENDING' });
      expect(await orderRow(order.id)).toMatchObject({ paymentStatus: 'PENDING' });
      expect(await vendorSees(s, order.id)).toBe(false);
      const ev = await t.prisma.paymentEvent.findFirstOrThrow({ where: { gatewayRef: ref } });
      expect(ev.note).toContain('Amount mismatch');
      expect(ev.processedAt).not.toBeNull();
      expect(alert).toHaveBeenCalledWith('Payment amount does not match', expect.any(String), expect.anything());
    });

    it('for a payment we do not know are recorded and escalated, without breaking anything', async () => {
      await notify('MOCKPAY-NOSUCHREF', 'PAID', { amount: '10.00' }).expect(200);
      await processAll();
      const ev = await t.prisma.paymentEvent.findFirstOrThrow({ where: { gatewayRef: 'MOCKPAY-NOSUCHREF' } });
      expect(ev).toMatchObject({ note: 'No payment with this reference.' });
      expect(ev.processedAt).not.toBeNull();
      expect(alert).toHaveBeenCalledWith('Payment notification for an unknown payment', expect.any(String), expect.anything());
    });

    it('keep only what support needs: no signature, no secret in the stored payload', async () => {
      const s = await scenario();
      const ref = (await latest((await placeOnline(s)).id)).gatewayRef!;
      await notify(ref, 'PAID', { amount: '350.00' }).expect(200);
      const ev = await t.prisma.paymentEvent.findFirstOrThrow({ where: { gatewayRef: ref } });
      const text = JSON.stringify(ev);
      expect(text).not.toContain(SECRET);
      expect(text).not.toMatch(/signature/i);
    });
  });

  describe('when the order is closed', () => {
    it('cancelling an unpaid order drops the pending attempt, and a payment that still arrives is refunded straight away', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const ref = (await latest(order.id)).gatewayRef!;
      await http.post(`/api/v1/orders/${order.id}/cancel`).set(s.customer.auth).send({ reason: 'Changed my mind' }).expect(200);
      expect(await latest(order.id)).toMatchObject({ status: 'FAILED', failureReason: 'The order was cancelled.' });

      await notify(ref, 'PAID', { amount: '350.00' }).expect(200);
      await processAll();
      expect(await latest(order.id)).toMatchObject({ status: 'REFUNDED', refundedAmount: expect.anything(), refundRef: expect.stringMatching(/^MOCKREF-/) });
      expect(await orderRow(order.id)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
      expect(await t.prisma.notification.count({ where: { userId: s.customer.user.id, template: 'order_refunded' } })).toBe(1);
      expect(await vendorNotices(s)).toBe(0); // the vendor never heard of it
      expect(await vendorSees(s, order.id)).toBe(false);
    });

    it('cancelling or rejecting a paid order queues its refund, and the refund gives the money back once', async () => {
      const s = await scenario();
      const cancelled = await placeOnline(s);
      await pay(cancelled);
      const p = await latest(cancelled.id);
      await http.post(`/api/v1/orders/${cancelled.id}/cancel`).set(s.customer.auth).send({}).expect(200);
      expect(queueRefund).toHaveBeenCalledWith(p.id, expect.any(String));

      const refund = jest.spyOn(gateway, 'refund');
      await payments.refundQuietly(p.id, 'Order cancelled');
      await payments.refundQuietly(p.id, 'Order cancelled'); // a repeated job
      expect(refund).toHaveBeenCalledTimes(1);
      expect(await latest(cancelled.id)).toMatchObject({ status: 'REFUNDED' });
      expect(await orderRow(cancelled.id)).toMatchObject({ paymentStatus: 'REFUNDED' });
      refund.mockRestore();

      const rejected = await placeOnline(s);
      await pay(rejected);
      await http.post(`/api/v1/vendor/orders/${rejected.id}/reject`).set(s.vendor.owner.auth).send({ reason: 'We are fully booked.' }).expect(200);
      expect(queueRefund).toHaveBeenCalledWith((await latest(rejected.id)).id, expect.any(String));
    });

    it('a cash order has nothing to refund', async () => {
      const s = await scenario();
      const cash = await placeOrder(http, s);
      await http.post(`/api/v1/orders/${cash.id}/cancel`).set(s.customer.auth).send({}).expect(200);
      expect(queueRefund).not.toHaveBeenCalled();
    });
  });

  describe('unpaid orders time out', () => {
    it('are cancelled after the payment window, never reach the vendor, and tell the customer', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      clock.set(new Date(NOW.getTime() + 14 * 60_000));
      expect((await payments.sweep()).cancelled).toBe(0); // still inside the window
      expect((await orderRow(order.id)).status).toBe('PLACED');

      clock.set(new Date(NOW.getTime() + 16 * 60_000));
      expect((await payments.sweep()).cancelled).toBeGreaterThanOrEqual(1);
      expect(await orderRow(order.id)).toMatchObject({ status: 'CANCELLED', cancelReason: 'Payment was not completed in time.' });
      expect(await latest(order.id)).toMatchObject({ status: 'FAILED', failureReason: 'Not paid in time.' });
      const history = await t.prisma.orderStatusHistory.findFirstOrThrow({ where: { orderId: order.id, toStatus: 'CANCELLED' } });
      expect(history.actorRole).toBeNull(); // the system
      expect(await t.prisma.notification.count({ where: { userId: s.customer.user.id, template: 'order_cancelled' } })).toBe(1);
      expect(await vendorNotices(s)).toBe(0);
    });

    it('a retry gives a fresh window', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      clock.set(new Date(NOW.getTime() + 10 * 60_000));
      await http.post(`/api/v1/orders/${order.id}/pay`).set(s.customer.auth).send({}).expect(200);
      clock.set(new Date(NOW.getTime() + 20 * 60_000)); // past the first window, inside the second
      await payments.sweep();
      expect((await orderRow(order.id)).status).toBe('PLACED');
      clock.set(new Date(NOW.getTime() + 26 * 60_000));
      await payments.sweep();
      expect((await orderRow(order.id)).status).toBe('CANCELLED');
    });

    it('cash orders and orders already paid never time out', async () => {
      const s = await scenario();
      const cash = await placeOrder(http, s);
      const paid = await placeOnline(s);
      await pay(paid);
      clock.set(new Date(NOW.getTime() + 60 * 60_000));
      await payments.sweep();
      expect((await orderRow(cash.id)).status).toBe('PLACED');
      expect((await orderRow(paid.id)).status).toBe('PLACED');
    });

    it('a payment whose notification was lost is found by asking the gateway, before the order is cancelled', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const ref = (await latest(order.id)).gatewayRef!;
      await gateway.simulate(ref, 'PAID', '350.00'); // paid at the gateway; our notification never arrived
      clock.set(new Date(NOW.getTime() + 16 * 60_000));
      await payments.sweep();
      expect(await orderRow(order.id)).toMatchObject({ status: 'PLACED', paymentStatus: 'PAID' });
      expect(await latest(order.id)).toMatchObject({ status: 'PAID' });
      expect(await vendorSees(s, order.id)).toBe(true);
    });

    it('reconciliation also settles a payment that is merely slow, and applies stored notifications nobody processed', async () => {
      const s = await scenario();
      const slow = await placeOnline(s);
      await gateway.simulate((await latest(slow.id)).gatewayRef!, 'PAID', '350.00');
      const stranded = await placeOnline(s);
      await notify((await latest(stranded.id)).gatewayRef!, 'PAID', { amount: '350.00' }).expect(200); // stored, never processed

      clock.set(new Date(NOW.getTime() + 11 * 60_000)); // past the reconcile threshold, inside the payment window
      await payments.sweep({ strandedAfterMs: 0 });
      expect(await orderRow(slow.id)).toMatchObject({ paymentStatus: 'PAID' });
      expect(await orderRow(stranded.id)).toMatchObject({ paymentStatus: 'PAID' });
    });
  });

  describe('after paying', () => {
    it('the browser coming back from the gateway only forwards to the order page; it never decides the result', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const get = await http.get(`/api/v1/payments/return/mock?order=${order.id}&status=PAID`).redirects(0).expect(303);
      expect(get.headers.location).toBe(`http://localhost:3000/orders/${order.id}?payment=returned`);
      const post = await http.post(`/api/v1/payments/return/mock?order=${order.id}`).type('form').send({ pp_ResponseCode: '000' }).redirects(0).expect(303);
      expect(post.headers.location).toBe(`http://localhost:3000/orders/${order.id}?payment=returned`);
      expect((await http.get('/api/v1/payments/return/mock?order=not-a-uuid').redirects(0).expect(303)).headers.location).toBe('http://localhost:3000/orders');
      expect((await latest(order.id)).status).toBe('PENDING');
    });
  });

  describe('admin', () => {
    it('lists and filters payments, and shows one with every notification the gateway sent', async () => {
      const s = await scenario();
      const order = await placeOnline(s, 'EASYPAISA');
      await pay(order);
      const p = await latest(order.id);

      const list = await http.get(`/api/v1/admin/payments?orderNo=${order.orderNo}&status=PAID&method=EASYPAISA`).set(admin.auth).expect(200);
      expect(list.body.data.map((x: { id: string }) => x.id)).toEqual([p.id]);
      expect(list.body.data[0]).toMatchObject({ amount: '350.00', refundedAmount: '0.00', method: 'EASYPAISA', status: 'PAID', order: { orderNo: order.orderNo } });
      expect(list.body.meta).toHaveProperty('nextCursor');
      await http.get('/api/v1/admin/payments?status=BOGUS').set(admin.auth).expect(400);

      const detail = await http.get(`/api/v1/admin/payments/${p.id}`).set(admin.auth).expect(200);
      expect(detail.body.data.events).toHaveLength(1);
      expect(detail.body.data.events[0]).toMatchObject({ status: 'PAID', amount: '350.00', processedAt: expect.any(String) });
      await http.get('/api/v1/admin/payments/00000000-0000-4000-8000-000000000000').set(admin.auth).expect(404);
    });

    it('refunds a paid payment once (audited), refuses unpaid and cash payments, and is admin-only', async () => {
      const s = await scenario();
      const order = await placeOnline(s);
      const p = await latest(order.id);
      const refund = (id: string, reason = 'Customer complaint upheld') => http.post(`/api/v1/admin/payments/${id}/refund`).set(admin.auth).send({ reason });

      expect((await refund(p.id).expect(409)).body.error.code).toBe('PAYMENT_NOT_REFUNDABLE'); // still pending
      await pay(order);
      await refund(p.id, 'x').expect(400); // reason too short

      const spy = jest.spyOn(gateway, 'refund');
      const done = await refund(p.id).expect(200);
      expect(done.body.data).toMatchObject({ status: 'REFUNDED', refundedAmount: '350.00' });
      await refund(p.id).expect(200); // idempotent
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
      expect(await t.prisma.auditLog.count({ where: { action: 'PAYMENT_REFUNDED', entityId: p.id } })).toBe(1);
      expect(await orderRow(order.id)).toMatchObject({ paymentStatus: 'REFUNDED' });

      const cash = await placeOrder(http, s);
      const cashPayment = await latest(cash.id);
      expect((await refund(cashPayment.id).expect(409)).body.error.code).toBe('PAYMENT_NOT_REFUNDABLE');
      await http.post(`/api/v1/admin/payments/${p.id}/refund`).set(s.customer.auth).send({ reason: 'Please' }).expect(403);
      await http.get('/api/v1/admin/payments').set(s.vendor.owner.auth).expect(403);
    });
  });
});

/** The request body for placing an order the way the helpers do (2 x Rs 100 + Rs 150 delivery). */
function body(s: OrderScenario, method: string) {
  return {
    vendorId: s.vendor.vendor.id,
    addressId: s.address.id,
    items: [{ serviceItemId: s.item.id, qty: 2 }],
    pickupSlotStart: '2026-10-24T05:00:00.000Z',
    deliverySlotStart: '2026-10-26T06:00:00.000Z',
    paymentMethod: method,
    expectedTotal: '350.00',
  };
}

