import { createHmac, randomUUID } from 'node:crypto';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import type { PaymentWebhookJob } from '../src/modules/payments/payments.jobs';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { Basics, NOW, TestApp, clearRateLimits, createCustomer, createTestApp, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, orderScenario, placeOrder } from './order-helpers';

describe('Payments (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let payments: PaymentsService;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    payments = t.app.get(PaymentsService);
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterAll(() => t.close());

  const scenario = (): Promise<OrderScenario> => orderScenario(t, basics);
  const initiate = (s: OrderScenario, orderId: string) =>
    http.post('/api/v1/payments/initiate').set(s.customer.auth).send({ orderId });

  const onlineOrder = async (method = 'CARD') => {
    const s = await scenario();
    const order = await placeOrder(http, s, { paymentMethod: method });
    const checkout = await initiate(s, order.id).expect(200);
    return { s, order, checkout: checkout.body.data as { paymentId: string; gatewayRef: string; gateway: string; amount: string } };
  };

  const signedWebhook = (body: Record<string, unknown>) => {
    const raw = JSON.stringify(body);
    const signature = createHmac('sha256', process.env.PAYMENT_MOCK_WEBHOOK_SECRET!).update(raw).digest('hex');
    return http
      .post('/api/v1/webhooks/card')
      .set('content-type', 'application/json')
      .set('x-payment-signature', signature)
      .send(raw);
  };

  const paidEvent = (
    checkout: { gateway: string; gatewayRef: string },
    amount = '350.00',
    eventId = randomUUID(),
  ): PaymentWebhookJob['event'] => ({
    gateway: checkout.gateway as PaymentWebhookJob['event']['gateway'],
    gatewayRef: checkout.gatewayRef,
    status: 'PAID',
    amount,
    eventId,
    payload: {},
  });

  it('starts and resumes a hosted checkout for a card order', async () => {
    const s = await scenario();
    const order = await placeOrder(http, s, { paymentMethod: 'CARD' });

    const first = await initiate(s, order.id).expect(200);
    expect(first.body.data).toMatchObject({
      orderId: order.id,
      gateway: 'payfast',
      amount: '350.00',
      status: 'PENDING',
      formFields: {},
    });
    expect(first.body.data.paymentId).toEqual(expect.any(String));
    expect(first.body.data.gatewayRef).toMatch(/^MOCK-PAYFAST-/);
    expect(first.body.data.redirectUrl).toContain('gateway=payfast');

    const second = await initiate(s, order.id).expect(200);
    expect(second.body.data).toMatchObject({ paymentId: first.body.data.paymentId, gatewayRef: first.body.data.gatewayRef });
    expect(await t.prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('rejects COD, someone else’s order and an already-paid order', async () => {
    const s = await scenario();
    const cod = await placeOrder(http, s);
    expect((await initiate(s, cod.id).expect(400)).body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');

    const online = await onlineOrder('JAZZCASH');
    const stranger = await createCustomer(t);
    expect((await initiate({ ...online.s, customer: stranger }, online.order.id).expect(404)).body.error.code).toBe('NOT_FOUND');

    await payments.applyEvent(paidEvent(online.checkout));
    expect((await initiate(online.s, online.order.id).expect(409)).body.error.code).toBe('PAYMENT_ALREADY_PAID');
  });

  it('accepts a signed webhook, then applies it once: paid, visible and vendor timer restarted', async () => {
    const { s, order, checkout } = await onlineOrder('CARD');
    const event = { ...paidEvent(checkout), payload: { pan: '4111111111111111', cvv: '123' } };
    const body = { gatewayRef: checkout.gatewayRef, status: 'PAID', amount: '350.00', eventId: event.eventId };

    const accepted = await signedWebhook(body).expect(200);
    expect(accepted.body.data).toEqual({ received: true });
    expect((await signedWebhook(body).set('x-payment-signature', 'nope').expect(401)).body.error.code).toBe('UNAUTHENTICATED');

    clock.set(new Date(NOW.getTime() + 60_000));
    const applied = await payments.applyEvent(event);
    expect(applied).toEqual({ duplicate: false, status: PaymentStatus.PAID });

    const row = await t.prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { vendor: { select: { respondWithinMin: true } } } });
    expect(row).toMatchObject({ status: OrderStatus.PLACED, paymentStatus: PaymentStatus.PAID });
    expect(row.vendorRespondBy.getTime()).toBe(clock.now().getTime() + row.vendor.respondWithinMin * 60_000);
    const paid = await t.prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(paid.status).toBe(PaymentStatus.PAID);
    expect(JSON.stringify(paid.rawPayload)).not.toContain('4111111111111111');

    await http.get(`/api/v1/vendor/orders/${order.id}`).set(s.vendor.owner.auth).expect(200);
    expect(await payments.applyEvent(event)).toEqual({ duplicate: true, status: PaymentStatus.PAID });
    expect(await payments.applyEvent({ ...event, status: 'FAILED', eventId: randomUUID() })).toEqual({
      duplicate: true,
      status: PaymentStatus.PAID,
    });
    expect(await t.prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('rejects a wrong amount without changing the payment or order', async () => {
    const { order, checkout } = await onlineOrder('EASYPAISA');
    await expect(payments.applyEvent(paidEvent(checkout, '1.00'))).rejects.toMatchObject({
      code: 'PAYMENT_AMOUNT_MISMATCH',
      details: { expected: '350.00', received: '1.00' },
    });
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe(PaymentStatus.PENDING);
    expect((await t.prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } })).status).toBe(PaymentStatus.PENDING);
  });

  it('refunds a payment that arrives after the order was cancelled', async () => {
    const { s, order, checkout } = await onlineOrder('RAAST');
    await http.post(`/api/v1/orders/${order.id}/cancel`).set(s.customer.auth).send({ reason: 'Changed my mind' }).expect(200);

    const applied = await payments.applyEvent(paidEvent(checkout));
    expect(applied).toMatchObject({ duplicate: false, status: PaymentStatus.REFUNDED, refunded: true });
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe(PaymentStatus.REFUNDED);
    const payment = await t.prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(payment.rawPayload).toMatchObject({ note: 'late payment refunded' });
  });

  it('cancels an unpaid online order when the payment window closes', async () => {
    const { s, order, checkout } = await onlineOrder('JAZZCASH');
    await t.prisma.order.update({ where: { id: order.id }, data: { createdAt: NOW } });
    await t.prisma.payment.update({ where: { id: checkout.paymentId }, data: { createdAt: NOW } });
    clock.set(new Date(NOW.getTime() + 11 * 60_000));

    const result = await payments.reconcile();
    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(result.cancelled).toBeGreaterThanOrEqual(1);

    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } }))).toMatchObject({
      status: OrderStatus.CANCELLED,
      paymentStatus: PaymentStatus.FAILED,
    });
    expect((await t.prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } })).status).toBe(PaymentStatus.FAILED);
    const history = await t.prisma.orderStatusHistory.findFirstOrThrow({
      where: { orderId: order.id, toStatus: OrderStatus.CANCELLED },
      orderBy: { seq: 'desc' },
    });
    expect(history).toMatchObject({ actorRole: null, actorId: null });
    expect(history.note).toContain('payment was not completed');
  });
});
