import { Role } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { Basics, NOW, TestApp, clearRateLimits, createCustomer, createLiveVendor, createTestApp, createUserWithToken, fixedClock, prepareReferenceData } from './helpers';

describe('Cart and estimate (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;

  beforeAll(async () => {
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(fixedClock(NOW)) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
  });
  beforeEach(() => clearRateLimits(t.redis));
  afterAll(() => t.close());

  const vendorWithItems = () =>
    createLiveVendor(t, basics, {
      items: [
        { name: 'Shirt', price: 149.99, turnaroundHours: 24 },
        { name: 'Suit', price: 1200, serviceType: 'DRY_CLEAN', categoryId: basics.dryCleanId, turnaroundHours: 72 },
        { name: 'Socks', price: 40, turnaroundHours: 48 },
      ],
    });

  describe('access', () => {
    it('requires a customer', async () => {
      const v = await vendorWithItems();
      await http.get('/api/v1/cart').expect(401);
      await http.post('/api/v1/cart/estimate').send({ vendorId: v.vendor.id }).expect(401);
      for (const role of [Role.VENDOR_OWNER, Role.RIDER, Role.ADMIN, Role.VENDOR_STAFF]) {
        const { auth } = await createUserWithToken(t, role);
        await http.get('/api/v1/cart').set(auth).expect(403);
        await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [] }).expect(403);
        await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(403);
      }
    });
  });

  describe('PUT /cart', () => {
    it('creates a cart, and a second PUT replaces it (idempotent set)', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      const [shirt, suit, socks] = v.items;

      const first = await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: shirt.id, qty: 2 }, { serviceItemId: suit.id, qty: 1 }] }).expect(200);
      expect(first.body.data).toMatchObject({ vendorId: v.vendor.id, subtotal: '1499.98', unavailableCount: 0 });
      expect(first.body.data.items).toHaveLength(2);

      const again = await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: shirt.id, qty: 2 }, { serviceItemId: suit.id, qty: 1 }] }).expect(200);
      expect(again.body.data.subtotal).toBe('1499.98');

      const replaced = await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: socks.id, qty: 5 }] }).expect(200);
      expect(replaced.body.data.items.map((i: { name: string }) => i.name)).toEqual(['Socks']);
      expect(replaced.body.data.subtotal).toBe('200.00');
      expect(await t.prisma.cartItem.count({ where: { cart: { vendorId: v.vendor.id } } })).toBe(1);
    });

    it('merges the same item listed twice and enforces quantity limits', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      const id = v.items[2].id;
      const merged = await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: id, qty: 3 }, { serviceItemId: id, qty: 4 }] }).expect(200);
      expect(merged.body.data.items).toEqual([expect.objectContaining({ serviceItemId: id, qty: 7 })]);

      const tooMany = await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: id, qty: 30 }, { serviceItemId: id, qty: 30 }] }).expect(400);
      expect(tooMany.body.error.code).toBe('QUANTITY_TOO_LARGE');
      for (const qty of [0, -1, 51, 1.5, '3']) {
        await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: id, qty }] }).expect(400);
      }
    });

    it("rejects another vendor's item, an inactive item, and a vendor that is not live", async () => {
      const v = await vendorWithItems();
      const other = await vendorWithItems();
      const { auth } = await createCustomer(t);

      const foreign = await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: other.items[0].id, qty: 1 }] }).expect(422);
      expect(foreign.body.error).toMatchObject({ code: 'ITEM_UNAVAILABLE', details: { unavailable: [other.items[0].id] } });

      await t.prisma.serviceItem.update({ where: { id: v.items[0].id }, data: { isActive: false } });
      await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(422);

      const pending = await createLiveVendor(t, basics, { status: 'PENDING' });
      await http.put('/api/v1/cart').set(auth).send({ vendorId: pending.vendor.id, items: [{ serviceItemId: pending.items[0].id, qty: 1 }] }).expect(404);
      await http.put('/api/v1/cart').set(auth).send({ vendorId: '00000000-0000-4000-8000-000000000000', items: [{ serviceItemId: v.items[1].id, qty: 1 }] }).expect(404);
      expect(await t.prisma.cart.count({ where: { vendorId: { in: [v.vendor.id, pending.vendor.id] } } })).toBe(0);
    });

    it('an empty list removes the cart', async () => {
      const v = await vendorWithItems();
      const { auth, user } = await createCustomer(t);
      await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(200);
      const res = await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [] }).expect(200);
      expect(res.body.data).toMatchObject({ items: [], subtotal: '0.00' });
      expect(await t.prisma.cart.count({ where: { customerId: user.id } })).toBe(0);
    });

    it('validates the payload and refuses unknown fields', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      const line = { serviceItemId: v.items[0].id, qty: 1 };
      for (const body of [
        {},
        { vendorId: 'nope', items: [] },
        { vendorId: v.vendor.id },
        { vendorId: v.vendor.id, items: [{ serviceItemId: 'nope', qty: 1 }] },
        { vendorId: v.vendor.id, items: [line], customerId: 'someone-else' },
        { vendorId: v.vendor.id, items: [{ ...line, price: 1 }] },
        { vendorId: v.vendor.id, items: Array.from({ length: 31 }, () => line) },
      ]) {
        await http.put('/api/v1/cart').set(auth).send(body).expect(400);
      }
    });

    it('keeps at most 10 open carts', async () => {
      const { auth } = await createCustomer(t);
      for (let i = 0; i < 10; i++) {
        const v = await createLiveVendor(t, basics);
        await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(200);
      }
      const extra = await createLiveVendor(t, basics);
      const res = await http.put('/api/v1/cart').set(auth).send({ vendorId: extra.vendor.id, items: [{ serviceItemId: extra.items[0].id, qty: 1 }] }).expect(422);
      expect(res.body.error.code).toBe('CART_LIMIT_REACHED');
      // updating an existing cart is still fine
      const mine = (await http.get('/api/v1/cart').set(auth)).body.data[0];
      const item = (await t.prisma.serviceItem.findFirstOrThrow({ where: { vendorId: mine.vendorId } })).id;
      await http.put('/api/v1/cart').set(auth).send({ vendorId: mine.vendorId, items: [{ serviceItemId: item, qty: 4 }] }).expect(200);
    });
  });

  describe('GET and DELETE /cart', () => {
    it('lists only my carts with current prices; flags items that disappeared', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      const stranger = await createCustomer(t);
      const [shirt, suit] = v.items;
      await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: shirt.id, qty: 2 }, { serviceItemId: suit.id, qty: 1 }] }).expect(200);
      await http.put('/api/v1/cart').set(stranger.auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: shirt.id, qty: 9 }] }).expect(200);

      let carts = (await http.get('/api/v1/cart').set(auth).expect(200)).body.data;
      expect(carts).toHaveLength(1);
      expect(carts[0]).toMatchObject({ vendorId: v.vendor.id, vendorName: v.vendor.businessName, vendorAvailable: true, subtotal: '1499.98' });

      // price change shows up; a removed item becomes unavailable and leaves the subtotal
      await t.prisma.serviceItem.update({ where: { id: shirt.id }, data: { price: 100 } });
      await t.prisma.serviceItem.update({ where: { id: suit.id }, data: { deletedAt: new Date(), isActive: false } });
      carts = (await http.get('/api/v1/cart').set(auth).expect(200)).body.data;
      expect(carts[0].subtotal).toBe('200.00');
      expect(carts[0].unavailableCount).toBe(1);
      expect(carts[0].items.find((i: { name: string }) => i.name === 'Suit')).toMatchObject({ available: false });
      expect(carts[0].items.find((i: { name: string }) => i.name === 'Shirt')).toMatchObject({ available: true, unitPrice: '100.00', lineTotal: '200.00' });

      // the vendor going away flags the whole cart
      await t.prisma.vendor.update({ where: { id: v.vendor.id }, data: { status: 'SUSPENDED' } });
      expect((await http.get('/api/v1/cart').set(auth)).body.data[0]).toMatchObject({ vendorAvailable: false, subtotal: '0.00' });
    });

    it('can filter by vendor and validates the id', async () => {
      const a = await vendorWithItems();
      const b = await vendorWithItems();
      const { auth } = await createCustomer(t);
      for (const v of [a, b]) await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(200);
      expect((await http.get('/api/v1/cart').set(auth)).body.data).toHaveLength(2);
      expect((await http.get(`/api/v1/cart?vendorId=${a.vendor.id}`).set(auth)).body.data.map((c: { vendorId: string }) => c.vendorId)).toEqual([a.vendor.id]);
      await http.get('/api/v1/cart?vendorId=nope').set(auth).expect(400);
    });

    it('deletes one cart or all of mine, never anyone else’s', async () => {
      const a = await vendorWithItems();
      const b = await vendorWithItems();
      const me = await createCustomer(t);
      const other = await createCustomer(t);
      for (const [c, v] of [[me, a], [me, b], [other, a]] as const) {
        await http.put('/api/v1/cart').set(c.auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(200);
      }
      await http.delete(`/api/v1/cart?vendorId=${a.vendor.id}`).set(me.auth).expect(204);
      expect((await http.get('/api/v1/cart').set(me.auth)).body.data.map((c: { vendorId: string }) => c.vendorId)).toEqual([b.vendor.id]);
      expect((await http.get('/api/v1/cart').set(other.auth)).body.data).toHaveLength(1);
      await http.delete('/api/v1/cart').set(me.auth).expect(204);
      expect((await http.get('/api/v1/cart').set(me.auth)).body.data).toEqual([]);
      expect((await http.get('/api/v1/cart').set(other.auth)).body.data).toHaveLength(1);
    });
  });

  describe('POST /cart/estimate', () => {
    it('prices items exactly (no float error) and adds the city delivery fee', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      const [shirt, suit] = v.items;
      const res = await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: shirt.id, qty: 3 }, { serviceItemId: suit.id, qty: 1 }] }).expect(200);
      expect(res.body.data).toMatchObject({
        currency: 'PKR',
        subtotal: '1649.97', // 3 x 149.99 + 1200
        deliveryFee: '150.00',
        discountTotal: '0.00',
        total: '1799.97',
        maxTurnaroundHours: 72,
        warnings: [],
        vendor: { id: v.vendor.id, availability: 'OPEN' },
      });
      expect(res.body.data.lines).toEqual([
        expect.objectContaining({ name: 'Shirt', unitPrice: '149.99', qty: 3, lineTotal: '449.97', turnaroundHours: 24 }),
        expect.objectContaining({ name: 'Suit', unitPrice: '1200.00', qty: 1, lineTotal: '1200.00', turnaroundHours: 72 }),
      ]);
    });

    it('never exposes commission or other internals', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      const res = await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/commission|earning|categoryId|cnic|owner/i);
    });

    it('prices the saved cart when no items are sent, and ignores the cart when items are sent', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      await http.put('/api/v1/cart').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[2].id, qty: 2 }] }).expect(200);
      expect((await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id }).expect(200)).body.data.subtotal).toBe('80.00');
      expect((await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(200)).body.data.subtotal).toBe('149.99');
    });

    it('follows the city delivery fee', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      await t.prisma.city.update({ where: { id: basics.cityId }, data: { deliveryFee: 0 } });
      try {
        const res = await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[2].id, qty: 1 }] }).expect(200);
        expect(res.body.data).toMatchObject({ deliveryFee: '0.00', total: '40.00' });
      } finally {
        await t.prisma.city.update({ where: { id: basics.cityId }, data: { deliveryFee: 150 } });
      }
    });

    it('warns when the vendor is not taking orders but still prices', async () => {
      const v = await createLiveVendor(t, basics, { availability: 'BUSY' });
      const { auth } = await createCustomer(t);
      const res = await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(200);
      expect(res.body.data.warnings).toEqual(['VENDOR_NOT_ACCEPTING_ORDERS']);
    });

    it('rejects promo codes explicitly instead of ignoring them', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      const res = await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }], promoCode: 'SAVE10' }).expect(400);
      expect(res.body.error.code).toBe('PROMO_UNAVAILABLE');
    });

    it('fails clearly for an empty cart, unavailable items and unknown vendors', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      expect((await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id }).expect(400)).body.error.code).toBe('CART_EMPTY');
      await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id, items: [] }).expect(400);
      const gone = await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: '00000000-0000-4000-8000-000000000000', qty: 1 }] }).expect(422);
      expect(gone.body.error.code).toBe('ITEM_UNAVAILABLE');
      await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: '00000000-0000-4000-8000-000000000000', items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(404);
    });

    it('answers well inside the 200 ms budget', async () => {
      const v = await vendorWithItems();
      const { auth } = await createCustomer(t);
      const body = { vendorId: v.vendor.id, items: v.items.map((i) => ({ serviceItemId: i.id, qty: 2 })) };
      await http.post('/api/v1/cart/estimate').set(auth).send(body).expect(200); // warm up
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = process.hrtime.bigint();
        await http.post('/api/v1/cart/estimate').set(auth).send(body).expect(200);
        times.push(Number(process.hrtime.bigint() - start) / 1e6);
      }
      times.sort((a, b) => a - b);
      expect(times[Math.floor(times.length * 0.95) - 1]).toBeLessThan(200);
    });
  });
});
