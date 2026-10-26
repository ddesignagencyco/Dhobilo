import { OrderStatus } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { LedgerService } from '../src/modules/finance/ledger.service';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createTestApp, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, orderScenario, placeOrder } from './order-helpers';

const IBAN = 'PK36SCBL0000001123456702';
const money = (v: unknown) => Number(v).toFixed(2);
const total = <T>(xs: T[], f: (x: T) => unknown) => xs.reduce((n, x) => n + Number(f(x)), 0);

/**
 * QA-6.2: the books must balance. Orders of different sizes are delivered, credited, one is refunded, a payout is
 * paid out, one order is cancelled and one is delivered but not yet credited; then every number is cross-checked
 * against the orders themselves, to the rupee.
 */
describe('Ledger reconciliation (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let ledger: LedgerService;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    ledger = t.app.get(LedgerService);
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterAll(() => t.close());

  const deliver = (orderId: string) => t.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.DELIVERED, deliveredAt: clock.now() } });

  it('orders, ledger, refunds and payouts agree to the rupee', async () => {
    const s: OrderScenario = await orderScenario(t, basics, { items: [{ name: 'Shirt', price: 100 }, { name: 'Suit', price: 750 }] });
    const [shirt, suit] = s.vendor.items;
    const vendorId = s.vendor.vendor.id;

    // three kinds of order: Rs 200 of shirts, a Rs 750 suit, and Rs 1,050 of both (plus Rs 150 delivery each)
    const kinds = [
      { items: [{ serviceItemId: shirt.id, qty: 2 }], expectedTotal: '350.00' },
      { items: [{ serviceItemId: suit.id, qty: 1 }], expectedTotal: '900.00' },
      { items: [{ serviceItemId: shirt.id, qty: 3 }, { serviceItemId: suit.id, qty: 1 }], expectedTotal: '1200.00' },
    ];
    const placed: { id: string; orderNo: string }[] = [];
    for (const k of [...kinds, ...kinds]) placed.push(await placeOrder(http, s, k));
    const [a, b, c, d, e, f] = placed;

    for (const o of [a, b, c, d, e, f]) await deliver(o.id);
    for (const o of [a, b, c, d, e]) expect(await ledger.postOrderEarnings(o.id)).toBe(true); // f is delivered but not credited yet
    for (const o of [a, b, c, d, e]) expect(await ledger.postOrderEarnings(o.id)).toBe(false); // posting is idempotent

    const refunded = c;
    expect(await ledger.refundOrderEarnings(refunded.id)).toBe(true);
    expect(await ledger.refundOrderEarnings(refunded.id)).toBe(false);

    const cancelled = await placeOrder(http, s, kinds[0]);
    await http.post(`/api/v1/orders/${cancelled.id}/cancel`).set(s.customer.auth).send({}).expect(200);
    expect(await ledger.postOrderEarnings(cancelled.id)).toBe(false); // never delivered, never credited

    // a payout, requested, approved and paid
    const asked = await http.post('/api/v1/vendor/payouts').set(s.vendor.owner.auth).send({ amount: '500.00', method: 'BANK', accountRef: IBAN }).expect(201);
    await http.post(`/api/v1/admin/payouts/${asked.body.data.id}/approve`).set(admin.auth).expect(200);
    await http.post(`/api/v1/admin/payouts/${asked.body.data.id}/pay`).set(admin.auth).send({ txnRef: 'BANK-1' }).expect(200);

    // ───── the checks ─────
    const orders = await t.prisma.order.findMany({ where: { vendorId } });
    const byId = new Map(orders.map((o) => [o.id, o]));
    const entries = await t.prisma.ledgerEntry.findMany({ where: { vendorId } });
    const sumOf = (type: string) => total(entries.filter((x) => x.type === type), (x) => x.amount);
    const credited = [a, b, c, d, e].map((o) => byId.get(o.id)!);

    // every order's own arithmetic holds: items - discount = vendor share + commission; total = that + delivery fee
    for (const o of orders) {
      expect(money(Number(o.subtotal) - Number(o.discountTotal))).toBe(money(Number(o.vendorEarning) + Number(o.commissionAmount)));
      expect(money(Number(o.subtotal) - Number(o.discountTotal) + Number(o.deliveryFee))).toBe(money(o.total));
    }
    // the three kinds really are different sizes, so this is not one number checked five times
    expect(new Set(credited.map((o) => money(o.total)))).toEqual(new Set(['350.00', '900.00', '1200.00']));

    // the ledger says what the orders say
    expect(money(sumOf('ORDER_EARNING'))).toBe(money(total(credited, (o) => o.vendorEarning)));
    expect(money(sumOf('COMMISSION'))).toBe(money(-total(credited, (o) => o.commissionAmount)));
    expect(money(sumOf('ORDER_EARNING') - sumOf('COMMISSION'))).toBe(money(total(credited, (o) => Number(o.subtotal) - Number(o.discountTotal)))); // earning + commission = what was bought
    expect(money(sumOf('REFUND'))).toBe(money(-Number(byId.get(refunded.id)!.vendorEarning)));
    expect(money(sumOf('PAYOUT'))).toBe('-500.00');

    // the vendor's balance is their share of the credited orders, less the refund, less what was paid out
    const expected = total(credited, (o) => o.vendorEarning) - Number(byId.get(refunded.id)!.vendorEarning) - 500;
    const balance = await ledger.balance(vendorId);
    expect(money(balance.total.toFixed(2))).toBe(money(expected));
    expect(money(balance.available.toFixed(2))).toBe(money(expected)); // nothing is waiting to be paid
    const report = await http.get('/api/v1/vendor/earnings?range=day').set(s.vendor.owner.auth).expect(200);
    expect(report.body.data.balance).toEqual({ total: money(expected), pending: '0.00', available: money(expected) });
    expect(money(Number(report.body.data.totals.gross) - Number(report.body.data.totals.commission))).toBe(report.body.data.totals.net);

    // orders that were not credited have no entries at all
    for (const o of [f, cancelled]) expect(entries.some((x) => x.orderId === o.id)).toBe(false);
    // and no order is credited twice
    const perOrder = new Map<string, number>();
    for (const x of entries.filter((y) => y.type === 'ORDER_EARNING')) perOrder.set(x.orderId!, (perOrder.get(x.orderId!) ?? 0) + 1);
    expect([...perOrder.values()].every((n) => n === 1)).toBe(true);
    expect(perOrder.size).toBe(5);
  });

  describe('the database itself protects the books', () => {
    it('refuses to edit or delete a ledger entry, and to post an order twice', async () => {
      const s = await orderScenario(t, basics);
      const order = await placeOrder(http, s);
      await deliver(order.id);
      await ledger.postOrderEarnings(order.id);
      const entry = await t.prisma.ledgerEntry.findFirstOrThrow({ where: { orderId: order.id, type: 'ORDER_EARNING' } });

      await expect(t.prisma.ledgerEntry.update({ where: { id: entry.id }, data: { amount: 999 } })).rejects.toThrow();
      await expect(t.prisma.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
      await expect(t.prisma.$executeRaw`UPDATE "LedgerEntry" SET amount = 1 WHERE id = ${entry.id}::uuid`).rejects.toThrow();
      await expect(t.prisma.ledgerEntry.create({ data: { vendorId: s.vendor.vendor.id, orderId: order.id, type: 'ORDER_EARNING', amount: 170 } })).rejects.toThrow();
      expect(await t.prisma.ledgerEntry.count({ where: { orderId: order.id } })).toBe(2);
    });

    it('refuses zero or negative payments, payouts and cash collections', async () => {
      const s = await orderScenario(t, basics);
      const order = await placeOrder(http, s);
      await expect(t.prisma.$executeRaw`UPDATE "Payment" SET amount = 0 WHERE "orderId" = ${order.id}::uuid`).rejects.toThrow();
      await expect(t.prisma.payout.create({ data: { vendorId: s.vendor.vendor.id, amount: 0, method: 'BANK', accountRef: IBAN } })).rejects.toThrow();
    });
  });
});
