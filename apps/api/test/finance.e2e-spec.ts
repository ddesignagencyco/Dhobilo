import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { CodService } from '../src/modules/finance/cod.service';
import { SETTLE_ORDER_JOB, SettleOrderJob } from '../src/modules/finance/finance.jobs';
import { FinanceProcessor } from '../src/modules/finance/finance.processor';
import { LedgerService } from '../src/modules/finance/ledger.service';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createTestApp, fixedClock, prepareReferenceData } from './helpers';
import { createRider } from './delivery-helpers';
import { OrderScenario, orderScenario, placeOrder } from './order-helpers';

describe('Finance (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let ledger: LedgerService;
  let cod: CodService;
  let processor: FinanceProcessor;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    ledger = t.app.get(LedgerService);
    cod = t.app.get(CodService);
    processor = new FinanceProcessor(ledger, cod);
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterAll(() => t.close());

  const scenario = (): Promise<OrderScenario> => orderScenario(t, basics);
  const deliver = (orderId: string) =>
    t.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.DELIVERED, deliveredAt: clock.now() },
    });
  const deliverPrepaid = async (orderId: string) => {
    await t.prisma.order.update({ where: { id: orderId }, data: { paymentMethod: PaymentMethod.CARD, paymentStatus: PaymentStatus.PAID } });
    await deliver(orderId);
  };
  /** A cash order delivered by `rider`, with the collection recorded the way the finance worker does it. */
  const deliverCash = async (s: OrderScenario, rider: Awaited<ReturnType<typeof createRider>>) => {
    const order = await placeOrder(http, s);
    await t.prisma.deliveryJob.create({
      data: { orderId: order.id, jobType: 'DROP', status: 'COMPLETED', riderId: rider.rider.id, scheduledStart: NOW, scheduledEnd: new Date(NOW.getTime() + 3_600_000), completedAt: clock.now(), riderFee: '50.00' },
    });
    await deliver(order.id);
    await settle(order.id);
    return order;
  };
  const settle = (orderId: string) =>
    processor.process({ name: SETTLE_ORDER_JOB, data: { orderId } } as Job<SettleOrderJob>);

  it('posts a delivered order to the ledger once, then serves the vendor balance, earnings and payout lifecycle', async () => {
    const s = await scenario();
    const order = await placeOrder(http, s);
    await deliverPrepaid(order.id);

    expect(await ledger.postOrderEarnings(order.id)).toBe(true);
    expect(await ledger.postOrderEarnings(order.id)).toBe(false);

    const entries = await t.prisma.ledgerEntry.findMany({ where: { orderId: order.id } });
    expect(entries.map((e) => ({ type: e.type, amount: e.amount.toFixed(2) })).sort((x, y) => x.type.localeCompare(y.type))).toEqual([
      { type: 'COMMISSION', amount: '-30.00' },
      { type: 'ORDER_EARNING', amount: '170.00' }, // the vendor's share, already net of the 30.00 commission
    ]);

    const earnings = await http.get('/api/v1/vendor/earnings?range=day').set(s.vendor.owner.auth).expect(200);
    expect(earnings.body.data.totals).toEqual({ orders: 1, gross: '200.00', commission: '30.00', net: '170.00' });
    expect(earnings.body.data.balance).toEqual({ total: '170.00', pending: '0.00', available: '170.00', awaitingCash: { orders: 0, amount: '0.00' } }); // the same 170.00 the report calls net

    const requested = await http
      .post('/api/v1/vendor/payouts')
      .set(s.vendor.owner.auth)
      .send({ amount: '100.00', method: 'BANK', accountRef: 'PK36SCBL0000001123456702', note: 'Weekly payout' })
      .expect(201);
    expect(requested.body.data).toMatchObject({
      amount: '100.00',
      method: 'BANK',
      accountRef: '••••6702',
      status: 'REQUESTED',
      note: 'Weekly payout',
    });
    const payoutId = requested.body.data.id as string;

    const tooMuch = await http
      .post('/api/v1/vendor/payouts')
      .set(s.vendor.owner.auth)
      .send({ amount: '100.00', method: 'WALLET', accountRef: '03001234567' })
      .expect(409);
    expect(tooMuch.body.error).toMatchObject({ code: 'PAYOUT_EXCEEDS_BALANCE', details: { available: '70.00' } }); // 170 less the 100 already asked for

    const list = await http.get('/api/v1/admin/payouts?status=REQUESTED').set(admin.auth).expect(200);
    expect(list.body.data.map((p: { id: string }) => p.id)).toContain(payoutId);

    const approved = await http.post(`/api/v1/admin/payouts/${payoutId}/approve`).set(admin.auth).expect(200);
    expect(approved.body.data).toMatchObject({ status: 'APPROVED', processedBy: admin.user.id });

    const paid = await http
      .post(`/api/v1/admin/payouts/${payoutId}/pay`)
      .set(admin.auth)
      .send({ txnRef: 'BANK-889122' })
      .expect(200);
    expect(paid.body.data).toMatchObject({ status: 'PAID', txnRef: 'BANK-889122', processedBy: admin.user.id });
    expect((await ledger.balance(s.vendor.vendor.id)).available.toFixed(2)).toBe('70.00');
    expect((await ledger.balance(s.vendor.vendor.id)).pending.toFixed(2)).toBe('0.00');
    expect(await ledger.postPayout(payoutId)).toBe(false);

    await http.post(`/api/v1/admin/payouts/${payoutId}/pay`).set(admin.auth).send({ txnRef: 'BANK-889123' }).expect(409);

    const second = await http
      .post('/api/v1/vendor/payouts')
      .set(s.vendor.owner.auth)
      .send({ amount: '20.00', method: 'WALLET', accountRef: '03001234567' })
      .expect(201);
    const secondId = second.body.data.id as string;

    const firstPage = await http
      .get(`/api/v1/admin/payouts?vendorId=${s.vendor.vendor.id}&limit=1`)
      .set(admin.auth)
      .expect(200);
    expect(firstPage.body.data).toHaveLength(1);
    expect(firstPage.body.meta.nextCursor).toEqual(expect.any(String));
    const nextPage = await http
      .get(
        `/api/v1/admin/payouts?vendorId=${s.vendor.vendor.id}&limit=1&cursor=${encodeURIComponent(firstPage.body.meta.nextCursor)}`,
      )
      .set(admin.auth)
      .expect(200);
    expect(nextPage.body.data).toHaveLength(1);
    expect(nextPage.body.meta.nextCursor).toBeNull();
    expect([...firstPage.body.data, ...nextPage.body.data].map((p: { id: string }) => p.id).sort()).toEqual(
      [payoutId, secondId].sort(),
    );

    const rejected = await http
      .post(`/api/v1/admin/payouts/${secondId}/reject`)
      .set(admin.auth)
      .send({ reason: 'Wallet details need updating' })
      .expect(200);
    expect(rejected.body.data).toMatchObject({ status: 'REJECTED', note: 'Wallet details need updating' });
    expect((await ledger.balance(s.vendor.vendor.id)).available.toFixed(2)).toBe('70.00');
  });

  it('reverses the net order earning once when a delivered order is refunded', async () => {
    const s = await scenario();
    const order = await placeOrder(http, s);
    await deliverPrepaid(order.id);
    expect(await ledger.postOrderEarnings(order.id)).toBe(true);

    expect(await ledger.refundOrderEarnings(order.id)).toBe(true);
    expect(await ledger.refundOrderEarnings(order.id)).toBe(false);

    expect((await ledger.balance(s.vendor.vendor.id)).total.toFixed(2)).toBe('0.00');
    const refund = await t.prisma.ledgerEntry.findFirstOrThrow({
      where: { orderId: order.id, type: 'REFUND' },
    });
    expect(refund.amount.toFixed(2)).toBe('-170.00');
  });

  it('settles COD through the worker, records the rider collection and clears it in an admin settlement batch', async () => {
    const s = await scenario();
    const order = await placeOrder(http, s);
    const r = await createRider(t, basics, { online: false });
    await t.prisma.deliveryJob.create({
      data: {
        orderId: order.id,
        jobType: 'DROP',
        status: 'COMPLETED',
        riderId: r.rider.id,
        scheduledStart: NOW,
        scheduledEnd: new Date(NOW.getTime() + 3_600_000),
        completedAt: clock.now(),
        riderFee: '50.00',
      },
    });
    await deliver(order.id);

    expect(await settle(order.id)).toEqual({ orderId: order.id, earned: false, collected: true }); // cash recorded; the vendor is not credited yet
    expect(await settle(order.id)).toEqual({ orderId: order.id, earned: false, collected: false });
    expect(await t.prisma.ledgerEntry.count({ where: { orderId: order.id } })).toBe(0);
    const waiting = await http.get('/api/v1/vendor/earnings?range=day').set(s.vendor.owner.auth).expect(200);
    expect(waiting.body.data.balance).toEqual({ total: '0.00', pending: '0.00', available: '0.00', awaitingCash: { orders: 1, amount: '170.00' } });

    const row = await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.paymentStatus).toBe(PaymentStatus.COD_COLLECTED);
    expect((await t.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe(
      PaymentStatus.COD_COLLECTED,
    );
    expect((await t.prisma.codCollection.findUniqueOrThrow({ where: { orderId: order.id } })).riderId).toBe(r.rider.id);

    const balances = await http.get('/api/v1/admin/cod/balances').set(admin.auth).expect(200);
    expect(balances.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ riderId: r.rider.id, orders: 1, amount: '350.00', name: r.user.name }),
      ]),
    );

    const collections = await http
      .get(`/api/v1/admin/cod/collections?riderId=${r.rider.id}&settled=false`)
      .set(admin.auth)
      .expect(200);
    expect(collections.body.data).toHaveLength(1);
    expect(collections.body.data[0]).toMatchObject({ orderId: order.id, riderId: r.rider.id, amount: '350.00' });
    expect(collections.body.meta.nextCursor).toBeNull();

    const settled = await http
      .post('/api/v1/admin/cod/settlements')
      .set(admin.auth)
      .send({ riderId: r.rider.id, reference: 'DEP-1024' })
      .expect(201);
    expect(settled.body.data).toMatchObject({ riderId: r.rider.id, amount: '350.00', collections: 1, ordersCredited: 1, reference: 'DEP-1024' });

    // the deposit is what credits the vendor, and it fully pays the order
    const credited = await t.prisma.ledgerEntry.findMany({ where: { orderId: order.id } });
    expect(credited.map((e) => [e.type, e.amount.toFixed(2)]).sort()).toEqual([['COMMISSION', '-30.00'], ['ORDER_EARNING', '170.00']]);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe(PaymentStatus.PAID);
    expect((await t.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe(PaymentStatus.PAID);
    const afterDeposit = await http.get('/api/v1/vendor/earnings?range=day').set(s.vendor.owner.auth).expect(200);
    expect(afterDeposit.body.data.balance).toEqual({ total: '170.00', pending: '0.00', available: '170.00', awaitingCash: { orders: 0, amount: '0.00' } });
    expect(await cod.settle({ riderId: r.rider.id }, admin.user.id).catch((e) => e.code)).toBe('COD_NOTHING_TO_SETTLE');

    const after = await http.get('/api/v1/admin/cod/balances').set(admin.auth).expect(200);
    expect(after.body.data.map((b: { riderId: string }) => b.riderId)).not.toContain(r.rider.id);

    const riderCash = await http.get('/api/v1/rider/cod').set(r.auth).expect(200);
    expect(riderCash.body.data).toMatchObject({ cashInHand: '0.00', unsettledOrders: 0 });
    expect(riderCash.body.data.collections[0]).toMatchObject({ orderId: order.id, settled: true });
  });

  it('lets admins manage commission rules and enforces the scope references', async () => {
    const s = await scenario();
    const created = await http
      .post('/api/v1/admin/commission-rules')
      .set(admin.auth)
      .send({ scope: 'GLOBAL', ratePct: 10, effectiveFrom: '2026-10-01T00:00:00.000Z' })
      .expect(201);
    expect(created.body.data).toMatchObject({ scope: 'GLOBAL', vendorId: null, categoryId: null, createdById: admin.user.id });
    expect(Number(created.body.data.ratePct)).toBe(10);
    const ruleId = created.body.data.id as string;

    await http
      .post('/api/v1/admin/commission-rules')
      .set(admin.auth)
      .send({ scope: 'GLOBAL', vendorId: s.vendor.vendor.id, ratePct: 12 })
      .expect(400)
      .then((res) => expect(res.body.error.code).toBe('VALIDATION_FAILED'));

    await http
      .post('/api/v1/admin/commission-rules')
      .set(admin.auth)
      .send({ scope: 'VENDOR', vendorId: '00000000-0000-4000-8000-000000000000', ratePct: 12 })
      .expect(404);

    await http
      .post('/api/v1/admin/commission-rules')
      .set(admin.auth)
      .send({ scope: 'CATEGORY', categoryId: 999999, ratePct: 12 })
      .expect(404);

    const list = await http.get('/api/v1/admin/commission-rules?scope=GLOBAL').set(admin.auth).expect(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).toContain(ruleId);

    const updated = await http
      .patch(`/api/v1/admin/commission-rules/${ruleId}`)
      .set(admin.auth)
      .send({ ratePct: 12.5 })
      .expect(200);
    expect(Number(updated.body.data.ratePct)).toBe(12.5);

    await http.delete(`/api/v1/admin/commission-rules/${ruleId}`).set(admin.auth).expect(204);
    const after = await http.get('/api/v1/admin/commission-rules?scope=GLOBAL').set(admin.auth).expect(200);
    expect(after.body.data.map((r: { id: string }) => r.id)).not.toContain(ruleId);
  });

  it('a cash order earns the vendor nothing until its cash is deposited, and a deposit credits only that rider\'s orders', async () => {
    const s = await scenario();
    const a = await createRider(t, basics, { online: false });
    const b = await createRider(t, basics, { online: false });
    const orderA = await deliverCash(s, a);
    const orderB = await deliverCash(s, b);

    // the ledger itself refuses to credit cash that has not arrived, however it is asked
    expect(await ledger.postOrderEarnings(orderA.id)).toBe(false);
    expect(await ledger.postOrderEarnings(orderB.id)).toBe(false);
    expect((await ledger.balance(s.vendor.vendor.id)).total.toFixed(2)).toBe('0.00');

    await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: a.rider.id, reference: 'DEP-A' }).expect(201);
    expect(await t.prisma.ledgerEntry.count({ where: { orderId: orderA.id } })).toBe(2);
    expect(await t.prisma.ledgerEntry.count({ where: { orderId: orderB.id } })).toBe(0); // rider B still holds the cash
    expect((await ledger.balance(s.vendor.vendor.id)).total.toFixed(2)).toBe('170.00');
    const mid = await http.get('/api/v1/vendor/earnings?range=day').set(s.vendor.owner.auth).expect(200);
    expect(mid.body.data.balance.awaitingCash).toEqual({ orders: 1, amount: '170.00' });
    expect(mid.body.data.totals).toMatchObject({ orders: 2, net: '340.00' }); // both are delivered and earned; only one is payable yet

    await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: b.rider.id, reference: 'DEP-B' }).expect(201);
    expect((await ledger.balance(s.vendor.vendor.id)).total.toFixed(2)).toBe('340.00');
  });

  it('settling cash credits the vendor exactly once even if posting is repeated, and a refunded cash order is taken back', async () => {
    const s = await scenario();
    const r = await createRider(t, basics, { online: false });
    const order = await deliverCash(s, r);
    await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: r.rider.id }).expect(201);
    expect(await ledger.postOrderEarnings(order.id, { cashDeposited: true })).toBe(false); // already credited
    expect(await t.prisma.ledgerEntry.count({ where: { orderId: order.id, type: 'ORDER_EARNING' } })).toBe(1);
    expect(await ledger.refundOrderEarnings(order.id)).toBe(true);
    expect((await ledger.balance(s.vendor.vendor.id)).total.toFixed(2)).toBe('0.00');
  });

  it('a prepaid order is credited as soon as it is delivered', async () => {
    const s = await scenario();
    const order = await placeOrder(http, s);
    await deliverPrepaid(order.id);
    expect(await settle(order.id)).toEqual({ orderId: order.id, earned: true, collected: false });
    expect((await ledger.balance(s.vendor.vendor.id)).total.toFixed(2)).toBe('170.00');
  });
});