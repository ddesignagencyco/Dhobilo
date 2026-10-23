import { randomUUID } from 'node:crypto';
import { JobType } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { OpsAlertService } from '../src/modules/delivery/ops-alert.service';
import { riderGeoKey } from '../src/modules/delivery/rider-presence.service';
import { EarningsPosterService } from '../src/modules/finance/earnings-poster.service';
import { MOCK_SIGNATURE_HEADER, mockSignature } from '../src/modules/payments/gateway/mock.gateway';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { NotificationOrchestrator } from '../src/modules/notifications/notification-orchestrator';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { TestRider, acceptedOrder, createRider, jobOf } from './delivery-helpers';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createTestApp, createUserWithToken, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, addStaff, orderScenario, placeOrder } from './order-helpers';

const SECRET = 'test-payment-mock-secret';
const money = (v: unknown) => Number(v).toFixed(2);

/** A valid-looking Pakistani IBAN (check digits worked out here, independently of the code under test). */
function iban(bank = 'HABB', account = '0012345678901234'): string {
  const digits = [...`${bank}${account}PK00`].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join('');
  return `PK${String(98n - (BigInt(digits) % 97n)).padStart(2, '0')}${bank}${account}`;
}

describe('Money: cash on delivery, ledger, earnings, payouts, commission (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let payments: PaymentsService;
  let poster: EarningsPosterService;
  let notify: jest.SpyInstance;
  let sms: jest.SpyInstance;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    payments = t.app.get(PaymentsService);
    poster = t.app.get(EarningsPosterService);
    jest.spyOn(OpsAlertService.prototype, 'alert').mockResolvedValue(undefined);
    notify = jest.spyOn(t.app.get(NotificationOrchestrator), 'notifyUser');
    sms = jest.spyOn(t.app.get(NotificationsService), 'sendSms');
  });
  beforeEach(async () => {
    clock.set(NOW);
    sms.mockClear();
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
    await t.prisma.rider.updateMany({ data: { isOnline: false } });
    await t.redis.del(riderGeoKey(basics.cityId));
  });
  afterAll(() => t.close());

  const rider = (r: { auth: Record<string, string> }, method: 'post' | 'get', path: string, body: object = {}) => http[method](`/api/v1/rider${path}`).set(r.auth).send(method === 'post' ? body : undefined);
  const lastCode = () => [...notify.mock.calls].reverse().find((c) => c[1] === 'delivery_code')![2].code as string;
  const vendorStep = (s: OrderScenario, id: string, status: string) => http.post(`/api/v1/vendor/orders/${id}/status`).set(s.vendor.owner.auth).send({ status }).expect(200);
  const ledger = (vendorId: string) => t.prisma.ledgerEntry.findMany({ where: { vendorId }, orderBy: { createdAt: 'asc' } });
  const sumLedger = async (vendorId: string) => money((await ledger(vendorId)).reduce((n, e) => n + Number(e.amount), 0));

  /** Pays an online order the way a gateway notification would. */
  async function payOnline(orderId: string, amount = '350.00') {
    const p = await t.prisma.payment.findFirstOrThrow({ where: { orderId }, orderBy: { attempt: 'desc' } });
    const body = JSON.stringify({ eventId: `evt-${randomUUID()}`, gatewayRef: p.gatewayRef, status: 'PAID', amount });
    await http.post('/api/v1/payments/webhooks/mock').set('content-type', 'application/json').set(MOCK_SIGNATURE_HEADER, mockSignature(SECRET, body)).send(body).expect(200);
    for (const e of await t.prisma.paymentEvent.findMany({ where: { processedAt: null } })) await payments.processEvent(e.id);
  }

  /** Takes an order all the way to DELIVERED through the rider app. */
  async function deliver(s: OrderScenario, r: TestRider, method: 'COD' | 'CARD' = 'COD') {
    const order = await placeOrder(http, s, method === 'COD' ? {} : { paymentMethod: method });
    if (method !== 'COD') await payOnline(order.id);
    await http.post(`/api/v1/vendor/orders/${order.id}/accept`).set(s.vendor.owner.auth).send({}).expect(200);
    const pickup = await jobOf(t, order.id, JobType.PICKUP);
    for (const step of ['claim', 'start', 'complete']) await rider(r, 'post', `/jobs/${pickup.id}/${step}`).expect(200);
    await vendorStep(s, order.id, 'IN_PROCESS');
    await vendorStep(s, order.id, 'READY');
    const drop = await jobOf(t, order.id, JobType.DROP);
    await rider(r, 'post', `/jobs/${drop.id}/claim`).expect(200);
    await rider(r, 'post', `/jobs/${drop.id}/start`).expect(200);
    await rider(r, 'post', `/jobs/${drop.id}/complete`, { otp: lastCode() }).expect(200);
    await poster.postIfDue(order.id); // what the finance worker does after DELIVERED
    return order;
  }

  // ───────────────────────────── cash on delivery ─────────────────────────────

  describe('cash on delivery', () => {
    it('delivering a cash order records the rider’s cash; the vendor is not credited yet', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      const order = await deliver(s, r);

      const collection = await t.prisma.codCollection.findUniqueOrThrow({ where: { orderId: order.id } });
      expect(collection).toMatchObject({ riderId: r.rider.id, settlementId: null });
      expect(money(collection.amount)).toBe('350.00');
      expect(await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'DELIVERED', paymentStatus: 'COD_COLLECTED' });
      expect(await t.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).toMatchObject({ gateway: 'cod', status: 'COD_COLLECTED' });
      expect(await ledger(s.vendor.vendor.id)).toHaveLength(0); // not until the cash reaches us
      expect(await poster.postIfDue(order.id)).toBe(false); // the finance worker leaves cash orders alone

      const cod = await rider(r, 'get', '/cod').expect(200);
      expect(cod.body.data).toMatchObject({ currency: 'PKR', outstanding: '350.00', outstandingCount: 1, collections: [{ orderNo: order.orderNo, amount: '350.00' }], recentSettlements: [] });

      const bal = await http.get('/api/v1/vendor/balance').set(s.vendor.owner.auth).expect(200);
      expect(bal.body.data).toMatchObject({ balance: '0.00', available: '0.00', pendingCod: '170.00', pendingCodOrders: 1 });
    });

    it('the rider job shows how much cash to collect on a cash delivery', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      const order = await placeOrder(http, s);
      await http.post(`/api/v1/vendor/orders/${order.id}/accept`).set(s.vendor.owner.auth).send({}).expect(200);
      const pickup = await jobOf(t, order.id, JobType.PICKUP);
      for (const step of ['claim', 'start', 'complete']) await rider(r, 'post', `/jobs/${pickup.id}/${step}`).expect(200);
      await vendorStep(s, order.id, 'IN_PROCESS');
      await vendorStep(s, order.id, 'READY');
      const drop = await jobOf(t, order.id, JobType.DROP);
      const view = await rider(r, 'post', `/jobs/${drop.id}/claim`).expect(200);
      expect(view.body.data.cod).toEqual({ collect: '350.00', currency: 'PKR' });
      const pick = await rider(r, 'get', `/jobs/${pickup.id}`).expect(200);
      expect(pick.body.data.cod).toBeNull(); // nothing to collect at pickup
    });

    it('admin sees who owes cash, and settling exactly what was handed in credits the vendor', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      await deliver(s, r);
      const owing = await http.get('/api/v1/admin/cod/riders').set(admin.auth).expect(200);
      expect(owing.body.data.find((x: { riderId: string }) => x.riderId === r.rider.id)).toMatchObject({ outstanding: '350.00', collections: 1, name: r.user.name });
      const list = await http.get(`/api/v1/admin/cod/riders/${r.rider.id}/collections`).set(admin.auth).expect(200);
      expect(list.body.data).toHaveLength(1);

      const wrong = await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: r.rider.id, amount: '300.00' }).expect(409);
      expect(wrong.body.error).toMatchObject({ code: 'COD_AMOUNT_MISMATCH', details: { expected: '350.00', given: '300.00', collections: 1 } });
      expect(await ledger(s.vendor.vendor.id)).toHaveLength(0);

      const done = await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: r.rider.id, amount: '350.00', reference: 'DEP-0042' }).expect(201);
      expect(done.body.data).toMatchObject({ amount: '350.00', reference: 'DEP-0042', collections: 1, vendorsCredited: 1 });

      const entries = await ledger(s.vendor.vendor.id);
      expect(entries.map((e) => [e.type, money(e.amount)])).toEqual([['ORDER_EARNING', '200.00'], ['COMMISSION', '-30.00']]);
      expect(await sumLedger(s.vendor.vendor.id)).toBe('170.00');
      const order = await t.prisma.order.findFirstOrThrow({ where: { vendorId: s.vendor.vendor.id } });
      expect(order.paymentStatus).toBe('PAID');
      expect(await t.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).toMatchObject({ status: 'PAID' });
      expect(await t.prisma.auditLog.count({ where: { action: 'COD_SETTLED', entityId: done.body.data.id } })).toBe(1);

      expect((await rider(r, 'get', '/cod').expect(200)).body.data).toMatchObject({ outstanding: '0.00', collections: [], recentSettlements: [{ amount: '350.00', reference: 'DEP-0042' }] });
      expect((await http.get('/api/v1/vendor/balance').set(s.vendor.owner.auth).expect(200)).body.data).toMatchObject({ balance: '170.00', available: '170.00', pendingCod: '0.00' });
      expect((await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: r.rider.id, amount: '350.00' }).expect(409)).body.error.code).toBe('COD_NOTHING_TO_SETTLE');
    });

    it('can settle some collections and not others, and refuses ids that are not the rider’s or already settled', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      const other = await createRider(t, basics, { lat: 31.6 });
      await deliver(s, r);
      await deliver(s, r);
      const both = (await http.get(`/api/v1/admin/cod/riders/${r.rider.id}/collections`).set(admin.auth).expect(200)).body.data as { id: string }[];
      expect(both).toHaveLength(2);

      const post = (body: object) => http.post('/api/v1/admin/cod/settlements').set(admin.auth).send(body);
      expect((await post({ riderId: r.rider.id, amount: '350.00', collectionIds: [both[0].id, randomUUID()] }).expect(409)).body.error.code).toBe('COD_COLLECTION_UNAVAILABLE');
      expect((await post({ riderId: other.rider.id, amount: '350.00', collectionIds: [both[0].id] }).expect(409)).body.error.code).toBe('COD_COLLECTION_UNAVAILABLE'); // belongs to another rider

      const part = await post({ riderId: r.rider.id, amount: '350.00', collectionIds: [both[0].id] }).expect(201);
      expect(part.body.data.collections).toBe(1);
      expect(await sumLedger(s.vendor.vendor.id)).toBe('170.00'); // one of two orders credited
      expect((await post({ riderId: r.rider.id, amount: '350.00', collectionIds: [both[0].id] }).expect(409)).body.error.code).toBe('COD_COLLECTION_UNAVAILABLE'); // already settled
      expect((await http.get('/api/v1/vendor/balance').set(s.vendor.owner.auth).expect(200)).body.data).toMatchObject({ balance: '170.00', pendingCod: '170.00' });

      await post({ riderId: r.rider.id, amount: '350.00' }).expect(201); // the rest
      expect(await sumLedger(s.vendor.vendor.id)).toBe('340.00');
    });

    it('two admins settling the same cash at once: exactly one succeeds and the vendor is credited once', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      await deliver(s, r);
      const results = await Promise.all(Array.from({ length: 5 }, () => http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: r.rider.id, amount: '350.00' })));
      expect(results.filter((x) => x.status === 201)).toHaveLength(1);
      expect(results.filter((x) => x.status === 409)).toHaveLength(4);
      expect(await ledger(s.vendor.vendor.id)).toHaveLength(2);
      expect(await t.prisma.codSettlement.count({ where: { riderId: r.rider.id } })).toBe(1);
    });

    it('validates the amount and is admin-only; settlements can be listed', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      await deliver(s, r);
      for (const amount of ['0', '-5', '12.345', 'abc', '']) await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: r.rider.id, amount }).expect(400);
      await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: 'nope', amount: '350.00' }).expect(400);
      await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: randomUUID(), amount: '350.00' }).expect(404);
      await http.post('/api/v1/admin/cod/settlements').set(r.auth).send({ riderId: r.rider.id, amount: '350.00' }).expect(403);
      await http.get('/api/v1/admin/cod/riders').set(s.vendor.owner.auth).expect(403);

      await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: r.rider.id, amount: '350.00' }).expect(201);
      const list = await http.get(`/api/v1/admin/cod/settlements?riderId=${r.rider.id}`).set(admin.auth).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ amount: '350.00', riderName: r.user.name, collections: 1 });
      expect(list.body.meta).toHaveProperty('nextCursor');
    });
  });

  // ───────────────────────────── online orders & the ledger ─────────────────────────────

  describe('online orders', () => {
    it('a delivered, paid order credits the vendor once: earning and commission add up to the vendor’s share', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      const order = await deliver(s, r, 'CARD');
      const entries = await ledger(s.vendor.vendor.id);
      expect(entries.map((e) => [e.type, money(e.amount), e.orderId])).toEqual([['ORDER_EARNING', '200.00', order.id], ['COMMISSION', '-30.00', order.id]]);
      expect(entries[1].note).toContain('15.00%');
      expect(await sumLedger(s.vendor.vendor.id)).toBe('170.00');

      expect(await poster.postIfDue(order.id)).toBe(false); // already posted: running again changes nothing
      expect(await poster.postIfDue(order.id)).toBe(false);
      expect(await ledger(s.vendor.vendor.id)).toHaveLength(2);
    });

    it('nothing is posted before delivery, and the database itself refuses a second posting', async () => {
      const s = await orderScenario(t, basics);
      const order = await placeOrder(http, s, { paymentMethod: 'CARD' });
      await payOnline(order.id);
      expect(await poster.postIfDue(order.id)).toBe(false); // PLACED
      await t.prisma.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
      expect(await poster.postIfDue(order.id)).toBe(true);
      await expect(t.prisma.ledgerEntry.create({ data: { vendorId: s.vendor.vendor.id, orderId: order.id, type: 'ORDER_EARNING', amount: 200 } })).rejects.toThrow();
    });

    it('the sweeper posts earnings that the queue missed', async () => {
      const s = await orderScenario(t, basics);
      const order = await placeOrder(http, s, { paymentMethod: 'CARD' });
      await payOnline(order.id);
      await t.prisma.order.update({ where: { id: order.id }, data: { status: 'DELIVERED', deliveredAt: NOW } });
      expect(await poster.sweep()).toBeGreaterThanOrEqual(1);
      expect(await sumLedger(s.vendor.vendor.id)).toBe('170.00');
      expect(await poster.sweep()).toBe(0);
    });

    it('refunding a delivered order takes the vendor’s share back, once', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      const order = await deliver(s, r, 'CARD');
      const p = await t.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      await http.post(`/api/v1/admin/payments/${p.id}/refund`).set(admin.auth).send({ reason: 'Clothes were damaged' }).expect(200);
      await http.post(`/api/v1/admin/payments/${p.id}/refund`).set(admin.auth).send({ reason: 'Clothes were damaged' }).expect(200);
      const entries = await ledger(s.vendor.vendor.id);
      expect(entries.map((e) => [e.type, money(e.amount)])).toEqual([['ORDER_EARNING', '200.00'], ['COMMISSION', '-30.00'], ['REFUND', '-170.00']]);
      expect(await sumLedger(s.vendor.vendor.id)).toBe('0.00');
      expect(await poster.postIfDue(order.id)).toBe(false); // refunded orders are never credited again
    });

    it('refunding before delivery needs no ledger entry', async () => {
      const s = await orderScenario(t, basics);
      const order = await placeOrder(http, s, { paymentMethod: 'CARD' });
      await payOnline(order.id);
      const p = await t.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      await http.post(`/api/v1/admin/payments/${p.id}/refund`).set(admin.auth).send({ reason: 'Customer asked' }).expect(200);
      expect(await ledger(s.vendor.vendor.id)).toHaveLength(0);
    });
  });

  // ───────────────────────────── the ledger ─────────────────────────────

  describe('the ledger', () => {
    it('is append-only: entries cannot be changed or deleted, even directly in the database', async () => {
      const s = await orderScenario(t, basics);
      const adj = await http.post('/api/v1/admin/ledger/adjustments').set(admin.auth).send({ vendorId: s.vendor.vendor.id, amount: 100, note: 'Goodwill credit' }).expect(201);
      await expect(t.prisma.ledgerEntry.update({ where: { id: adj.body.data.id }, data: { amount: 999 } })).rejects.toThrow();
      await expect(t.prisma.ledgerEntry.delete({ where: { id: adj.body.data.id } })).rejects.toThrow();
      await expect(t.prisma.$executeRaw`UPDATE "LedgerEntry" SET amount = 1 WHERE id = ${adj.body.data.id}::uuid`).rejects.toThrow();
    });

    it('admin adjustments are signed, explained, audited and validated', async () => {
      const s = await orderScenario(t, basics);
      const post = (body: object) => http.post('/api/v1/admin/ledger/adjustments').set(admin.auth).send(body);
      const credit = await post({ vendorId: s.vendor.vendor.id, amount: 250.5, note: 'Courier cash reconciled' }).expect(201);
      expect(credit.body.data).toMatchObject({ type: 'ADJUSTMENT', amount: '250.50', note: 'Courier cash reconciled' });
      await post({ vendorId: s.vendor.vendor.id, amount: -50, note: 'Damaged-item deduction' }).expect(201);
      expect(await sumLedger(s.vendor.vendor.id)).toBe('200.50');
      expect(await t.prisma.auditLog.count({ where: { action: 'LEDGER_ADJUSTED', entityId: credit.body.data.id } })).toBe(1);

      await post({ vendorId: s.vendor.vendor.id, amount: 0, note: 'Nothing at all' }).expect(400);
      await post({ vendorId: s.vendor.vendor.id, amount: 5, note: 'x' }).expect(400);
      await post({ vendorId: s.vendor.vendor.id, amount: 1.234, note: 'Too precise' }).expect(400);
      await post({ vendorId: randomUUID(), amount: 5, note: 'Unknown vendor' }).expect(404);
      await http.post('/api/v1/admin/ledger/adjustments').set(s.vendor.owner.auth).send({ vendorId: s.vendor.vendor.id, amount: 5, note: 'Self-credit attempt' }).expect(403);

      const view = await http.get(`/api/v1/admin/vendors/${s.vendor.vendor.id}/ledger`).set(admin.auth).expect(200);
      expect(view.body.data.map((e: { type: string }) => e.type)).toEqual(['ADJUSTMENT', 'ADJUSTMENT']);
      expect(view.body.meta.balance).toMatchObject({ balance: '200.50', available: '200.50' });
    });
  });

  // ───────────────────────────── vendor earnings ─────────────────────────────

  describe('vendor earnings', () => {
    it('summarises a day, week and month with commission deducted, and a row per day', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      await deliver(s, r, 'CARD');
      await deliver(s, r, 'CARD');
      const get = (q: string) => http.get(`/api/v1/vendor/earnings?${q}`).set(s.vendor.owner.auth);

      const day = (await get('period=day&date=2026-10-23').expect(200)).body.data;
      expect(day).toMatchObject({ period: 'day', from: '2026-10-23', to: '2026-10-23', currency: 'PKR', gross: '400.00', commission: '60.00', refunds: '0.00', adjustments: '0.00', net: '340.00', orders: 2 });
      expect(day.days).toEqual([{ date: '2026-10-23', gross: '400.00', commission: '60.00', refunds: '0.00', adjustments: '0.00', net: '340.00', orders: 2 }]);

      const week = (await get('period=week&date=2026-10-23').expect(200)).body.data;
      expect(week).toMatchObject({ from: '2026-10-19', to: '2026-10-25', net: '340.00', orders: 2 });
      expect(week.days).toHaveLength(7);
      expect(week.days.filter((d: { orders: number }) => d.orders > 0).map((d: { date: string }) => d.date)).toEqual(['2026-10-23']);

      const month = (await get('period=month&date=2026-10-05').expect(200)).body.data;
      expect(month).toMatchObject({ from: '2026-10-01', to: '2026-10-31', net: '340.00' });
      expect(month.days).toHaveLength(31);

      expect((await get('period=day&date=2026-10-22').expect(200)).body.data).toMatchObject({ gross: '0.00', net: '0.00', orders: 0 });
      expect((await get('period=day').expect(200)).body.data.from).toBe('2026-10-23'); // defaults to today (shop time)
    });

    it('shows refunds and adjustments in the net', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      const order = await deliver(s, r, 'CARD');
      await http.post(`/api/v1/admin/payments/${(await t.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).id}/refund`).set(admin.auth).send({ reason: 'Damaged' }).expect(200);
      await http.post('/api/v1/admin/ledger/adjustments').set(admin.auth).send({ vendorId: s.vendor.vendor.id, amount: 20, note: 'Bonus' }).expect(201);
      const day = (await http.get('/api/v1/vendor/earnings?period=day&date=2026-10-23').set(s.vendor.owner.auth).expect(200)).body.data;
      expect(day).toMatchObject({ gross: '200.00', commission: '30.00', refunds: '170.00', adjustments: '20.00', net: '20.00' });
    });

    it('lists the orders behind the numbers, newest first, with paging, and marks refunded ones', async () => {
      const s = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      const first = await deliver(s, r, 'CARD');
      const second = await deliver(s, r, 'CARD');
      await http.post(`/api/v1/admin/payments/${(await t.prisma.payment.findFirstOrThrow({ where: { orderId: first.id } })).id}/refund`).set(admin.auth).send({ reason: 'Damaged' }).expect(200);

      const page1 = await http.get('/api/v1/vendor/earnings/orders?limit=1').set(s.vendor.owner.auth).expect(200);
      expect(page1.body.data).toHaveLength(1);
      expect(page1.body.data[0]).toMatchObject({ orderNo: second.orderNo, paymentMethod: 'CARD', gross: '200.00', commissionRatePct: '15.00', commission: '30.00', net: '170.00', refunded: false });
      const page2 = await http.get(`/api/v1/vendor/earnings/orders?limit=1&cursor=${page1.body.meta.nextCursor}`).set(s.vendor.owner.auth).expect(200);
      expect(page2.body.data[0]).toMatchObject({ orderNo: first.orderNo, refunded: true });
      expect(page2.body.meta.nextCursor).toBeNull();

      const out = await http.get('/api/v1/vendor/earnings/orders?from=2026-01-01&to=2026-01-31').set(s.vendor.owner.auth).expect(200);
      expect(out.body.data).toEqual([]);
    });

    it('keeps vendors apart, validates the query, and is for owners of live vendors only', async () => {
      const a = await orderScenario(t, basics);
      const b = await orderScenario(t, basics);
      const r = await createRider(t, basics);
      await deliver(a, r, 'CARD');
      expect((await http.get('/api/v1/vendor/balance').set(b.vendor.owner.auth).expect(200)).body.data.balance).toBe('0.00');
      expect((await http.get('/api/v1/vendor/balance').set(a.vendor.owner.auth).expect(200)).body.data.balance).toBe('170.00');

      const v = (q: string) => http.get(`/api/v1/vendor/earnings${q}`).set(a.vendor.owner.auth);
      await v('').expect(400); // period is required
      await v('?period=year').expect(400);
      await v('?period=day&date=tomorrow').expect(400);
      await http.get('/api/v1/vendor/earnings/orders?from=2026-10-30&to=2026-10-01').set(a.vendor.owner.auth).expect(400);

      const staff = await addStaff(t, a);
      await http.get('/api/v1/vendor/balance').set(staff.auth).expect(403); // money is for the owner
      const customer = await createUserWithToken(t, 'CUSTOMER');
      await http.get('/api/v1/vendor/balance').set(customer.auth).expect(403);
      await http.get('/api/v1/vendor/balance').expect(401);

      await t.prisma.vendor.update({ where: { id: a.vendor.vendor.id }, data: { status: 'PENDING' } });
      await http.get('/api/v1/vendor/balance').set(a.vendor.owner.auth).expect(403); // not an approved vendor
      await t.prisma.vendor.update({ where: { id: a.vendor.vendor.id }, data: { status: 'APPROVED' } });
    });
  });

  // ───────────────────────────── payouts ─────────────────────────────

  describe('payouts', () => {
    async function fundedVendor(amount = 5000) {
      const s = await orderScenario(t, basics);
      await http.post('/api/v1/admin/ledger/adjustments').set(admin.auth).send({ vendorId: s.vendor.vendor.id, amount, note: 'Test funds' }).expect(201);
      return s;
    }
    const request = (s: OrderScenario, body: object) => http.post('/api/v1/vendor/payouts').set(s.vendor.owner.auth).send(body);
    const bank = (amount: string) => ({ amount, method: 'BANK', account: iban() });
    const adminPost = (id: string, action: string, body: object = {}) => http.post(`/api/v1/admin/payouts/${id}/${action}`).set(admin.auth).send(body);

    it('a request sets the money aside, shows the account masked, and keeps the real number encrypted', async () => {
      const s = await fundedVendor();
      const number = iban();
      const res = await request(s, { amount: '1500.00', method: 'BANK', account: number.replace(/(.{4})/g, '$1 ').toLowerCase() }).expect(201);
      expect(res.body.data).toMatchObject({ status: 'REQUESTED', amount: '1500.00', method: 'BANK', currency: 'PKR' });
      expect(res.body.data.accountMask).toMatch(/^PK\d{2}\*+[0-9]{4}$/);
      expect(JSON.stringify(res.body)).not.toContain(number);
      expect(res.body.data).not.toHaveProperty('accountRef');

      const row = await t.prisma.payout.findUniqueOrThrow({ where: { id: res.body.data.id } });
      expect(row.accountRef).not.toContain(number);
      expect(row.accountRef).not.toContain('HABB');

      const bal = (await http.get('/api/v1/vendor/balance').set(s.vendor.owner.auth).expect(200)).body.data;
      expect(bal).toMatchObject({ balance: '5000.00', available: '3500.00', reservedForPayouts: '1500.00', paidOut: '0.00' });
      const list = await http.get('/api/v1/vendor/payouts').set(s.vendor.owner.auth).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(JSON.stringify(list.body)).not.toContain(number);
      expect(await sumLedger(s.vendor.vendor.id)).toBe('5000.00'); // the ledger moves only when the money is sent
    });

    it('checks the amount, the minimum, the account and the balance', async () => {
      const s = await fundedVendor(1000);
      expect((await request(s, bank('499.99')).expect(400)).body.error).toMatchObject({ code: 'PAYOUT_BELOW_MINIMUM', details: { min: '500.00' } });
      expect((await request(s, bank('1000.01')).expect(409)).body.error).toMatchObject({ code: 'INSUFFICIENT_BALANCE', details: { available: '1000.00', requested: '1000.01' } });
      for (const amount of ['0', '-500', '500.555', 'lots', '']) await request(s, bank(amount)).expect(400);

      const bad = iban().slice(0, -1) + (iban().endsWith('0') ? '1' : '0');
      expect((await request(s, { amount: '500', method: 'BANK', account: bad }).expect(400)).body.error.code).toBe('INVALID_ACCOUNT');
      expect((await request(s, { amount: '500', method: 'BANK', account: '03001234567' }).expect(400)).body.error.code).toBe('INVALID_ACCOUNT');
      expect((await request(s, { amount: '500', method: 'WALLET', account: iban() }).expect(400)).body.error.code).toBe('INVALID_ACCOUNT');
      await request(s, { amount: '500', method: 'CHEQUE', account: iban() }).expect(400);
      await request(s, { ...bank('500'), status: 'PAID' }).expect(400); // smuggled field
      const wallet = await request(s, { amount: '500', method: 'WALLET', account: '0300 1234567' }).expect(201);
      expect(wallet.body.data.accountMask).toBe('+92300***567');
    });

    it('five requests at once for a balance that covers two: exactly two succeed', async () => {
      const s = await fundedVendor(1000);
      const results = await Promise.all(Array.from({ length: 5 }, () => request(s, bank('500'))));
      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      expect(results.filter((r) => r.status === 409)).toHaveLength(3);
      expect((await http.get('/api/v1/vendor/balance').set(s.vendor.owner.auth).expect(200)).body.data).toMatchObject({ available: '0.00', reservedForPayouts: '1000.00' });
    });

    it('admin approves, then pays: the ledger is debited, the vendor is texted, and nothing can be paid twice', async () => {
      const s = await fundedVendor();
      const id = (await request(s, bank('2000')).expect(201)).body.data.id;

      expect((await adminPost(id, 'pay', { txnRef: 'TXN-1' }).expect(409)).body.error.code).toBe('PAYOUT_INVALID_TRANSITION'); // must be approved first
      const approved = await adminPost(id, 'approve').expect(200);
      expect(approved.body.data).toMatchObject({ status: 'APPROVED' });
      await adminPost(id, 'approve').expect(409);
      await adminPost(id, 'pay', {}).expect(400); // the transfer reference is required

      const paid = await adminPost(id, 'pay', { txnRef: 'TXN-20261023-77', note: 'Sent via 1LINK' }).expect(200);
      expect(paid.body.data).toMatchObject({ status: 'PAID', txnRef: 'TXN-20261023-77', note: 'Sent via 1LINK', processedAt: expect.any(String) });
      const entries = await ledger(s.vendor.vendor.id);
      expect(entries.at(-1)).toMatchObject({ type: 'PAYOUT', payoutId: id });
      expect(money(entries.at(-1)!.amount)).toBe('-2000.00');
      expect(await sumLedger(s.vendor.vendor.id)).toBe('3000.00');
      expect(sms).toHaveBeenCalledWith(s.vendor.owner.user.phone, expect.stringContaining('TXN-20261023-77'), expect.anything());
      expect((await http.get('/api/v1/vendor/balance').set(s.vendor.owner.auth).expect(200)).body.data).toMatchObject({ balance: '3000.00', available: '3000.00', reservedForPayouts: '0.00', paidOut: '2000.00' });

      await adminPost(id, 'pay', { txnRef: 'TXN-AGAIN' }).expect(409);
      await adminPost(id, 'reject', { reason: 'Too late' }).expect(409);
      expect(await t.prisma.auditLog.count({ where: { entityId: id, action: { in: ['PAYOUT_REQUESTED', 'PAYOUT_APPROVED', 'PAYOUT_PAID'] } } })).toBe(3);
    });

    it('rejecting releases the money and tells the vendor why', async () => {
      const s = await fundedVendor();
      const id = (await request(s, bank('4000')).expect(201)).body.data.id;
      expect((await http.get('/api/v1/vendor/balance').set(s.vendor.owner.auth).expect(200)).body.data.available).toBe('1000.00');
      await adminPost(id, 'reject', {}).expect(400);
      const rejected = await adminPost(id, 'reject', { reason: 'Account details do not match' }).expect(200);
      expect(rejected.body.data).toMatchObject({ status: 'REJECTED', note: 'Account details do not match' });
      expect((await http.get('/api/v1/vendor/balance').set(s.vendor.owner.auth).expect(200)).body.data).toMatchObject({ available: '5000.00', reservedForPayouts: '0.00' });
      expect(sms).toHaveBeenCalledWith(s.vendor.owner.user.phone, expect.stringContaining('Account details do not match'), expect.anything());
      expect((await adminPost(id, 'approve').expect(409)).body.error.code).toBe('PAYOUT_INVALID_TRANSITION');
      expect(await sumLedger(s.vendor.vendor.id)).toBe('5000.00');
    });

    it('will not pay a payout the balance no longer covers (for example after a refund was taken back)', async () => {
      const s = await fundedVendor(1000);
      const id = (await request(s, bank('1000')).expect(201)).body.data.id;
      await adminPost(id, 'approve').expect(200);
      await http.post('/api/v1/admin/ledger/adjustments').set(admin.auth).send({ vendorId: s.vendor.vendor.id, amount: -400, note: 'Chargeback' }).expect(201);
      const res = await adminPost(id, 'pay', { txnRef: 'TXN-X' }).expect(409);
      expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_BALANCE', details: { balance: '600.00', amount: '1000.00' } });
      expect((await t.prisma.payout.findUniqueOrThrow({ where: { id } })).status).toBe('APPROVED');
      expect(await ledger(s.vendor.vendor.id).then((e) => e.filter((x) => x.type === 'PAYOUT'))).toHaveLength(0);
    });

    it('admin lists the queue, and sees the real account only on the detail (audited)', async () => {
      const s = await fundedVendor();
      const number = iban();
      const id = (await request(s, { amount: '1000', method: 'BANK', account: number }).expect(201)).body.data.id;

      const queue = await http.get(`/api/v1/admin/payouts?status=REQUESTED&vendorId=${s.vendor.vendor.id}`).set(admin.auth).expect(200);
      expect(queue.body.data.map((p: { id: string }) => p.id)).toEqual([id]);
      expect(queue.body.data[0]).toMatchObject({ vendorName: expect.any(String), amount: '1000.00' });
      expect(JSON.stringify(queue.body)).not.toContain(number);
      await http.get('/api/v1/admin/payouts?status=NOPE').set(admin.auth).expect(400);

      const detail = await http.get(`/api/v1/admin/payouts/${id}`).set(admin.auth).expect(200);
      expect(detail.body.data.account).toBe(number);
      expect(await t.prisma.auditLog.count({ where: { action: 'PAYOUT_ACCOUNT_VIEWED', entityId: id } })).toBe(1);
      await http.get(`/api/v1/admin/payouts/${randomUUID()}`).set(admin.auth).expect(404);
      await http.get(`/api/v1/admin/payouts/${id}`).set(s.vendor.owner.auth).expect(403);
    });

    it('pages through a vendor’s own requests, newest first', async () => {
      const s = await fundedVendor(10_000);
      for (const amount of ['500', '600', '700']) await request(s, bank(amount)).expect(201);
      const p1 = await http.get('/api/v1/vendor/payouts?limit=2').set(s.vendor.owner.auth).expect(200);
      expect(p1.body.data.map((p: { amount: string }) => p.amount)).toEqual(['700.00', '600.00']);
      const p2 = await http.get(`/api/v1/vendor/payouts?limit=2&cursor=${p1.body.meta.nextCursor}`).set(s.vendor.owner.auth).expect(200);
      expect(p2.body.data.map((p: { amount: string }) => p.amount)).toEqual(['500.00']);
      expect(p2.body.meta.nextCursor).toBeNull();
    });

    it('a suspended vendor can read their money but cannot ask for more', async () => {
      const s = await fundedVendor();
      await t.prisma.vendor.update({ where: { id: s.vendor.vendor.id }, data: { status: 'SUSPENDED' } });
      await http.get('/api/v1/vendor/balance').set(s.vendor.owner.auth).expect(200);
      await http.get('/api/v1/vendor/earnings?period=day').set(s.vendor.owner.auth).expect(200);
      expect((await request(s, bank('1000')).expect(403)).body.error.code).toBe('VENDOR_NOT_ACTIVE');
    });
  });

  // ───────────────────────────── commission ─────────────────────────────

  describe('commission rules', () => {
    // Rules made here would change the rate for every later test, so each test cleans up after itself.
    afterEach(async () => {
      await t.prisma.commissionRule.deleteMany({ where: { createdById: admin.user.id } });
    });
    const create = (body: object) => http.post('/api/v1/admin/commission-rules').set(admin.auth).send(body);

    it('a new rule applies to orders placed from its start time; the order keeps that rate for good', async () => {
      const s = await orderScenario(t, basics);
      const before = await placeOrder(http, s);
      const res = await create({ scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: 22.5 }).expect(201);
      expect(res.body.data).toMatchObject({ scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: '22.50', startsInFuture: false });

      const after = await placeOrder(http, s);
      const rows = await t.prisma.order.findMany({ where: { id: { in: [before.id, after.id] } } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      expect(money(byId.get(before.id)!.commissionRatePct)).toBe('15.00');
      expect(money(byId.get(before.id)!.commissionAmount)).toBe('30.00');
      expect(money(byId.get(after.id)!.commissionRatePct)).toBe('22.50');
      expect(money(byId.get(after.id)!.commissionAmount)).toBe('45.00');
      expect(money(byId.get(after.id)!.vendorEarning)).toBe('155.00');
    });

    it('a rule that starts later does not touch orders until then', async () => {
      const s = await orderScenario(t, basics);
      const later = new Date(NOW.getTime() + 3_600_000).toISOString();
      const res = await create({ scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: 30, effectiveFrom: later }).expect(201);
      expect(res.body.data.startsInFuture).toBe(true);
      const today = await placeOrder(http, s);
      expect(money((await t.prisma.order.findUniqueOrThrow({ where: { id: today.id } })).commissionRatePct)).toBe('15.00');

      clock.set(new Date(NOW.getTime() + 2 * 3_600_000));
      const list = await http.get(`/api/v1/admin/commission-rules?vendorId=${s.vendor.vendor.id}`).set(admin.auth).expect(200);
      expect(list.body.data).toEqual([expect.objectContaining({ id: res.body.data.id, ratePct: '30.00', current: true, startsInFuture: false })]);
    });

    it('lists which rule is in force for each target, newest first', async () => {
      const s = await orderScenario(t, basics);
      const old = await create({ scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: 10 }).expect(201);
      clock.set(new Date(NOW.getTime() + 60_000));
      const newer = await create({ scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: 12, effectiveFrom: new Date(NOW.getTime() + 120_000).toISOString() }).expect(201);
      clock.set(new Date(NOW.getTime() + 180_000));
      const list = (await http.get(`/api/v1/admin/commission-rules?scope=VENDOR&vendorId=${s.vendor.vendor.id}`).set(admin.auth).expect(200)).body.data;
      expect(list.map((r: { id: string; current: boolean }) => [r.id, r.current])).toEqual([[newer.body.data.id, true], [old.body.data.id, false]]);
    });

    it('checks that the scope matches its target, the rate range, and the start time', async () => {
      const s = await orderScenario(t, basics);
      const bad = async (body: object, code: string) => expect((await create(body).expect(400)).body.error.code).toBe(code);
      await bad({ scope: 'GLOBAL', vendorId: s.vendor.vendor.id, ratePct: 10 }, 'INVALID_COMMISSION_RULE');
      await bad({ scope: 'VENDOR', ratePct: 10 }, 'INVALID_COMMISSION_RULE');
      await bad({ scope: 'CATEGORY', ratePct: 10 }, 'INVALID_COMMISSION_RULE');
      await bad({ scope: 'CATEGORY', categoryId: basics.washIronId, vendorId: s.vendor.vendor.id, ratePct: 10 }, 'INVALID_COMMISSION_RULE');
      await bad({ scope: 'GLOBAL', ratePct: 10, effectiveFrom: new Date(NOW.getTime() - 3_600_000).toISOString() }, 'EFFECTIVE_DATE_IN_PAST');
      for (const ratePct of [-1, 50.01, 'lots', 10.123]) expect((await create({ scope: 'GLOBAL', ratePct }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
      expect((await create({ scope: 'VENDOR', vendorId: randomUUID(), ratePct: 10 }).expect(404)).body.error.code).toBe('NOT_FOUND');
      expect((await create({ scope: 'CATEGORY', categoryId: 99999, ratePct: 10 }).expect(404)).body.error.code).toBe('NOT_FOUND');
      expect((await create({ scope: 'GLOBAL', ratePct: 10, extra: 1 }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
    });

    it('refuses two rules for the same target starting at the same moment', async () => {
      const s = await orderScenario(t, basics);
      const at = new Date(NOW.getTime() + 600_000).toISOString();
      await create({ scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: 10, effectiveFrom: at }).expect(201);
      expect((await create({ scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: 11, effectiveFrom: at }).expect(409)).body.error.code).toBe('COMMISSION_RULE_EXISTS');
    });

    it('only a rule that has not started can be removed (history is kept), and only by admins', async () => {
      const s = await orderScenario(t, basics);
      const future = await create({ scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: 18, effectiveFrom: new Date(NOW.getTime() + 600_000).toISOString() }).expect(201);
      const started = await create({ scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: 19 }).expect(201);

      await http.delete(`/api/v1/admin/commission-rules/${future.body.data.id}`).set(s.vendor.owner.auth).expect(403);
      await http.delete(`/api/v1/admin/commission-rules/${future.body.data.id}`).set(admin.auth).expect(204);
      expect(await t.prisma.commissionRule.count({ where: { id: future.body.data.id } })).toBe(0);
      expect(await t.prisma.auditLog.count({ where: { action: 'COMMISSION_RULE_REMOVED', entityId: future.body.data.id } })).toBe(1);
      expect((await http.delete(`/api/v1/admin/commission-rules/${started.body.data.id}`).set(admin.auth).expect(409)).body.error.code).toBe('COMMISSION_RULE_ACTIVE');
      await http.delete(`/api/v1/admin/commission-rules/${randomUUID()}`).set(admin.auth).expect(404);
      expect(await t.prisma.auditLog.count({ where: { action: 'COMMISSION_RULE_CREATED', entityId: started.body.data.id } })).toBe(1);
    });
  });

  // ───────────────────────────── the books balance ─────────────────────────────

  describe('reconciliation (QA-6.2)', () => {
    it('across a mix of paid, cash, refunded and cancelled orders the ledger equals the orders to the rupee', async () => {
      const s = await orderScenario(t, basics, { items: [{ name: 'Shirt', price: 100 }, { name: 'Suit', price: 750 }] });
      const r = await createRider(t, basics);
      const vendorId = s.vendor.vendor.id;

      const prepaid = [await deliver(s, r, 'CARD'), await deliver(s, r, 'CARD'), await deliver(s, r, 'CARD')];
      const cash = [await deliver(s, r), await deliver(s, r)];
      await http.post('/api/v1/admin/cod/settlements').set(admin.auth).send({ riderId: r.rider.id, amount: '700.00' }).expect(201);
      const cashUnsettled = await deliver(s, r); // delivered, rider still holds the money
      const refunded = prepaid[0];
      await http.post(`/api/v1/admin/payments/${(await t.prisma.payment.findFirstOrThrow({ where: { orderId: refunded.id } })).id}/refund`).set(admin.auth).send({ reason: 'Damaged' }).expect(200);
      const cancelled = await placeOrder(http, s, { paymentMethod: 'CARD' });
      await payOnline(cancelled.id);
      await http.post(`/api/v1/orders/${cancelled.id}/cancel`).set(s.customer.auth).send({}).expect(200);
      await placeOrder(http, s); // still open

      const orders = await t.prisma.order.findMany({ where: { vendorId } });
      const credited = orders.filter((o) => [...prepaid, ...cash].some((c) => c.id === o.id));
      expect(credited).toHaveLength(5);
      const total = (xs: typeof orders, f: (o: (typeof orders)[number]) => unknown) => xs.reduce((n, o) => n + Number(f(o)), 0);

      const entries = await ledger(vendorId);
      const byType = (type: string) => entries.filter((e) => e.type === type).reduce((n, e) => n + Number(e.amount), 0);
      // what each credited order was worth to the vendor, before and after commission
      expect(money(byType('ORDER_EARNING'))).toBe(money(total(credited, (o) => Number(o.vendorEarning) + Number(o.commissionAmount))));
      expect(money(byType('COMMISSION'))).toBe(money(-total(credited, (o) => o.commissionAmount)));
      expect(money(byType('REFUND'))).toBe(money(-Number(refunded && orders.find((o) => o.id === refunded.id)!.vendorEarning)));
      // and every order's own arithmetic holds: items - discount = vendor share + commission; total = that + delivery fee
      for (const o of orders) {
        expect(money(Number(o.subtotal) - Number(o.discountTotal))).toBe(money(Number(o.vendorEarning) + Number(o.commissionAmount)));
        expect(money(Number(o.subtotal) - Number(o.discountTotal) + Number(o.deliveryFee))).toBe(money(o.total));
      }
      // so the vendor's balance is exactly: their share of every credited order, minus the refunded one
      const expected = total(credited, (o) => o.vendorEarning) - Number(orders.find((o) => o.id === refunded.id)!.vendorEarning);
      expect(await sumLedger(vendorId)).toBe(money(expected));
      // cash that has not reached us is not in the ledger, only in "pending"
      expect(entries.some((e) => e.orderId === cashUnsettled.id)).toBe(false);
      expect((await http.get('/api/v1/vendor/balance').set(s.vendor.owner.auth).expect(200)).body.data).toMatchObject({ balance: money(expected), pendingCod: money(Number(orders.find((o) => o.id === cashUnsettled.id)!.vendorEarning)) });
      // no order is credited twice, and cancelled / open orders are not credited at all
      const perOrder = new Map<string, number>();
      for (const e of entries.filter((x) => x.type === 'ORDER_EARNING')) perOrder.set(e.orderId!, (perOrder.get(e.orderId!) ?? 0) + 1);
      expect([...perOrder.values()].every((n) => n === 1)).toBe(true);
      expect(perOrder.has(cancelled.id)).toBe(false);

      // money in = money out: every online payment is either kept (paid) or given back (refunded)
      const paymentsRows = await t.prisma.payment.findMany({ where: { order: { vendorId }, gateway: 'mock' } });
      const kept = paymentsRows.filter((p) => p.status === 'PAID').reduce((n, p) => n + Number(p.amount), 0);
      const given = paymentsRows.filter((p) => p.status === 'REFUNDED').reduce((n, p) => n + Number(p.refundedAmount), 0);
      expect(money(kept + given)).toBe(money(paymentsRows.reduce((n, p) => n + Number(p.amount), 0)));
      expect(given).toBeGreaterThan(0);
    });
  });
});
