import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import {
  Basics,
  NOW,
  TestApp,
  clearRateLimits,
  createAdmin,
  createTestApp,
  fixedClock,
  prepareReferenceData,
} from './helpers';
import { OrderScenario, anotherCustomer, orderScenario } from './order-helpers';

describe('Promotions (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
  });
  afterAll(() => t.close());

  const validFrom = new Date(NOW.getTime() - 86_400_000).toISOString();
  const validTo = new Date(NOW.getTime() + 7 * 86_400_000).toISOString();

  async function createPromo(extra: Record<string, unknown> = {}) {
    const code = `E2E${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const created = await http
      .post('/api/v1/admin/promos')
      .set(admin.auth)
      .send({
        code,
        discountType: 'PERCENT',
        value: '10',
        maxDiscount: '20',
        minOrderAmount: '100',
        maxUses: 100,
        perUserLimit: 1,
        validFrom,
        validTo,
        isActive: true,
        ...extra,
      })
      .expect(201);
    return { ...created.body.data, code } as { id: string; code: string };
  }

  const lines = (s: OrderScenario, qty = 2) => [{ serviceItemId: s.item.id, qty }];

  function place(s: OrderScenario, code: string, expectedTotal = '330.00') {
    return http
      .post('/api/v1/orders')
      .set(s.customer.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        vendorId: s.vendor.vendor.id,
        addressId: s.address.id,
        items: lines(s),
        pickupSlotStart: '2026-10-24T05:00:00.000Z',
        deliverySlotStart: '2026-10-26T06:00:00.000Z',
        paymentMethod: 'COD',
        expectedTotal,
        promoCode: code,
      });
  }

  it('previews and applies a promo at checkout, recording the redemption once', async () => {
    const s = await orderScenario(t, basics);
    const promo = await createPromo();

    const preview = await http
      .post('/api/v1/promos/validate')
      .set(s.customer.auth)
      .send({ vendorId: s.vendor.vendor.id, code: promo.code.toLowerCase(), items: lines(s) })
      .expect(200);
    expect(preview.body.data).toMatchObject({
      subtotal: '200.00',
      discountTotal: '20.00',
      total: '330.00',
      promo: { code: promo.code, discountTotal: '20.00' },
    });

    const placed = await place(s, promo.code).expect(201);
    expect(placed.body.data).toMatchObject({
      subtotal: '200.00',
      discountTotal: '20.00',
      deliveryFee: '150.00',
      total: '330.00',
      promo: { code: promo.code },
    });

    const redemption = await t.prisma.promoRedemption.findUniqueOrThrow({
      where: { promoId_orderId: { promoId: promo.id, orderId: placed.body.data.id } },
    });
    expect(redemption.userId).toBe(s.customer.user.id);
    expect(redemption.amount.toFixed(2)).toBe('20.00');

    const detail = await http.get(`/api/v1/admin/promos/${promo.id}`).set(admin.auth).expect(200);
    expect(detail.body.data.stats).toEqual({ redemptions: 1, uniqueCustomers: 1, discountTotal: '20.00' });
  });

  it('rejects a promo that would exceed the per-customer limit', async () => {
    const s = await orderScenario(t, basics);
    const promo = await createPromo({ perUserLimit: 1 });
    await place(s, promo.code).expect(201);

    const again = await place(s, promo.code).expect(422);
    expect(again.body.error.code).toBe('PROMO_USAGE_LIMIT');
    expect(await t.prisma.promoRedemption.count({ where: { promoId: promo.id } })).toBe(1);
  });

  it('serializes checkout so two customers cannot take the last use', async () => {
    const first = await orderScenario(t, basics);
    const second = await anotherCustomer(t, basics, first);
    const promo = await createPromo({ maxUses: 1, perUserLimit: 1 });

    const results = await Promise.all([place(first, promo.code), place(second, promo.code)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(results.find((r) => r.status === 422)?.body.error.code).toBe('PROMO_USAGE_LIMIT');
    expect(await t.prisma.promoRedemption.count({ where: { promoId: promo.id } })).toBe(1);
    expect(await t.prisma.order.count({ where: { promoId: promo.id } })).toBe(1);
  });

  it('supports admin search by code or owner name, update and soft delete', async () => {
    const promo = await createPromo();
    const byCode = await http.get(`/api/v1/admin/promos?q=${encodeURIComponent(promo.code.slice(0, 6))}`).set(admin.auth).expect(200);
    expect(byCode.body.data.map((p: { id: string }) => p.id)).toContain(promo.id);

    const owner = await orderScenario(t, basics);
    await t.prisma.user.update({ where: { id: owner.customer.user.id }, data: { name: 'Zainab Owner' } });
    const personal = await t.prisma.promoCode.create({
      data: {
        code: `OWN${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        discountType: 'FLAT',
        value: '50',
        validFrom: new Date(validFrom),
        validTo: new Date(validTo),
        ownerUserId: owner.customer.user.id,
      },
    });
    const byOwner = await http.get('/api/v1/admin/promos?q=Zainab').set(admin.auth).expect(200);
    expect(byOwner.body.data.map((p: { id: string }) => p.id)).toContain(personal.id);

    await http.patch(`/api/v1/admin/promos/${promo.id}`).set(admin.auth).send({ isActive: false, maxUses: 5 }).expect(200);
    const detail = await http.get(`/api/v1/admin/promos/${promo.id}`).set(admin.auth).expect(200);
    expect(detail.body.data).toMatchObject({ isActive: false, maxUses: 5 });

    await http.delete(`/api/v1/admin/promos/${promo.id}`).set(admin.auth).expect(204);
    await http.get(`/api/v1/admin/promos/${promo.id}`).set(admin.auth).expect(404);
  });
});
