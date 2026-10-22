import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import {
  Basics,
  NOW,
  TestApp,
  clearRateLimits,
  createAddress,
  createAdmin,
  createCustomer,
  createLiveVendor,
  createTestApp,
  createUserWithToken,
  fixedClock,
  prepareReferenceData,
} from './helpers';

// "Now" = Friday 2026-10-23 10:00 Karachi. Pickup Sat 10:00-11:00 local; default turnaround is 48 h, so the
// earliest delivery window is Mon 2026-10-26 11:00 local (06:00Z).
const PICKUP = '2026-10-24T05:00:00.000Z';
const DELIVERY = '2026-10-26T06:00:00.000Z';

describe('Orders (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  const placed: { orderId: string; vendorId: string; customerId: string }[] = [];

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    t.app.get(EventEmitter2).on('order.placed', (e) => placed.push(e));
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterAll(() => t.close());

  /** A live vendor (Shirt Rs 100, 48 h), a customer and a saved address next door. */
  async function scenario(vendorOpts: Parameters<typeof createLiveVendor>[2] = {}) {
    const vendor = await createLiveVendor(t, basics, { ...vendorOpts });
    const customer = await createCustomer(t);
    const address = await createAddress(t, customer.user.id, basics.cityId);
    return { vendor, customer, address, item: vendor.items[0] };
  }
  type Scenario = Awaited<ReturnType<typeof scenario>>;

  const body = (s: Scenario, extra: Record<string, unknown> = {}) => ({
    vendorId: s.vendor.vendor.id,
    addressId: s.address.id,
    items: [{ serviceItemId: s.item.id, qty: 2 }],
    pickupSlotStart: PICKUP,
    deliverySlotStart: DELIVERY,
    paymentMethod: 'COD',
    expectedTotal: '350.00', // 2 x 100 + 150 delivery
    ...extra,
  });
  const place = (s: Scenario, extra: Record<string, unknown> = {}, key: string | null = randomUUID()) => {
    let req = http.post('/api/v1/orders').set(s.customer.auth);
    if (key) req = req.set('Idempotency-Key', key);
    return req.send(body(s, extra));
  };

  describe('placing an order', () => {
    it('creates a PLACED COD order with exact totals, frozen snapshots and an audit trail', async () => {
      const s = await scenario();
      const before = placed.length;
      const res = await place(s, { customerNote: '  Please fold gently ' }).expect(201);
      const o = res.body.data;

      expect(o).toMatchObject({
        status: 'PLACED',
        currency: 'PKR',
        subtotal: '200.00',
        discountTotal: '0.00',
        deliveryFee: '150.00',
        total: '350.00',
        paymentMethod: 'COD',
        paymentStatus: 'COD_PENDING',
        customerNote: 'Please fold gently',
        pickupSlotStart: PICKUP,
        pickupSlotEnd: '2026-10-24T06:00:00.000Z',
        deliverySlotStart: DELIVERY,
        deliverySlotEnd: '2026-10-26T07:00:00.000Z',
        vendor: { id: s.vendor.vendor.id, businessName: s.vendor.vendor.businessName },
        addressSnapshot: { line1: '12 Test Street', cityId: basics.cityId },
      });
      expect(o.orderNo).toMatch(/^DHB-LHR-\d{6}$/);
      expect(o.items).toEqual([expect.objectContaining({ serviceItemId: s.item.id, name: 'Shirt', unitPrice: '100.00', qty: 2, lineTotal: '200.00' })]);
      expect(new Date(o.vendorRespondBy).getTime()).toBe(NOW.getTime() + 15 * 60_000);

      // customers never see the platform's commission
      expect(JSON.stringify(res.body)).not.toMatch(/commission|vendorEarning|idempotency/i);

      const row = await t.prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { history: true, payments: true } });
      expect(row).toMatchObject({ customerId: s.customer.user.id, vendorId: s.vendor.vendor.id, cityId: basics.cityId });
      expect(Number(row.commissionRatePct)).toBe(15);
      expect(Number(row.commissionAmount)).toBe(30); // 15% of the Rs 200 of items; the delivery fee is not commissionable
      expect(Number(row.vendorEarning)).toBe(170);
      expect(row.history).toHaveLength(1);
      expect(row.history[0]).toMatchObject({ fromStatus: null, toStatus: 'PLACED', actorId: s.customer.user.id, actorRole: 'CUSTOMER' });
      expect(row.payments).toHaveLength(1);
      expect(row.payments[0]).toMatchObject({ method: 'COD', gateway: 'cod', status: 'COD_PENDING' });
      expect(Number(row.payments[0].amount)).toBe(350);

      expect(placed.slice(before)).toEqual([expect.objectContaining({ orderId: o.id, vendorId: s.vendor.vendor.id, customerId: s.customer.user.id })]);
    });

    it('numbers orders per city in sequence', async () => {
      const s = await scenario();
      const a = (await place(s).expect(201)).body.data.orderNo as string;
      const b = (await place(s).expect(201)).body.data.orderNo as string;
      const n = (x: string) => Number(x.split('-')[2]);
      expect(n(b)).toBe(n(a) + 1);
    });

    it('later changes to the address or the catalog never alter a placed order', async () => {
      const s = await scenario();
      const id = (await place(s).expect(201)).body.data.id;
      await t.prisma.address.update({ where: { id: s.address.id }, data: { line1: 'Somewhere else entirely', lat: 1, lng: 1 } });
      await t.prisma.serviceItem.update({ where: { id: s.item.id }, data: { price: 999, itemName: 'Renamed' } });
      const o = (await http.get(`/api/v1/orders/${id}`).set(s.customer.auth).expect(200)).body.data;
      expect(o.addressSnapshot.line1).toBe('12 Test Street');
      expect(o.items[0]).toMatchObject({ name: 'Shirt', unitPrice: '100.00', lineTotal: '200.00' });
      expect(o.total).toBe('350.00');
    });

    it('clears the customer’s cart for that vendor', async () => {
      const s = await scenario();
      await http.put('/api/v1/cart').set(s.customer.auth).send({ vendorId: s.vendor.vendor.id, items: [{ serviceItemId: s.item.id, qty: 2 }] }).expect(200);
      await place(s).expect(201);
      expect((await http.get('/api/v1/cart').set(s.customer.auth)).body.data).toEqual([]);
    });

    it('uses the vendor’s own commission rule over the global one', async () => {
      const s = await scenario();
      await t.prisma.commissionRule.create({ data: { scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: 8, effectiveFrom: new Date('2026-01-01Z') } });
      const id = (await place(s).expect(201)).body.data.id;
      const row = await t.prisma.order.findUniqueOrThrow({ where: { id } });
      expect([Number(row.commissionRatePct), Number(row.commissionAmount), Number(row.vendorEarning)]).toEqual([8, 16, 184]);
    });

    it('places an order with several items and categories using each line’s current price', async () => {
      const s = await scenario({
        items: [{ name: 'Shirt', price: 149.99 }, { name: 'Suit', price: 1200, serviceType: 'DRY_CLEAN', categoryId: basics.dryCleanId, turnaroundHours: 72 }],
      });
      await t.prisma.commissionRule.create({ data: { scope: 'CATEGORY', categoryId: basics.dryCleanId, ratePct: 5, effectiveFrom: new Date('2026-01-01Z') } });
      const lines = [{ serviceItemId: s.vendor.items[0].id, qty: 3 }, { serviceItemId: s.vendor.items[1].id, qty: 1 }];
      // 72 h turnaround -> delivery no earlier than Tue 2026-10-27 11:00 local
      const res = await place(s, { items: lines, expectedTotal: '1799.97', deliverySlotStart: '2026-10-27T06:00:00.000Z' }).expect(201);
      expect(res.body.data).toMatchObject({ subtotal: '1649.97', total: '1799.97' });
      const row = await t.prisma.order.findUniqueOrThrow({ where: { id: res.body.data.id } });
      // 15% of 449.97 + 5% of 1200 = 67.4955 + 60 = 127.4955 -> 127.50
      expect([Number(row.commissionAmount), Number(row.vendorEarning)]).toEqual([127.5, 1522.47]);
    });
  });

  describe('idempotency', () => {
    it('requires a well-formed Idempotency-Key', async () => {
      const s = await scenario();
      expect((await place(s, {}, null).expect(400)).body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      for (const bad of ['short', 'has spaces in it!!', 'x'.repeat(101)]) {
        expect((await place(s, {}, bad).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
      }
      expect(await t.prisma.order.count({ where: { customerId: s.customer.user.id } })).toBe(0);
    });

    it('a retry with the same key returns the same order (200) and creates nothing new', async () => {
      const s = await scenario();
      const key = randomUUID();
      const first = await place(s, {}, key).expect(201);
      const retry = await place(s, {}, key).expect(200);
      expect(retry.headers['idempotent-replay']).toBe('true');
      expect(retry.body.data.id).toBe(first.body.data.id);
      expect(retry.body.data.orderNo).toBe(first.body.data.orderNo);
      expect(await t.prisma.order.count({ where: { customerId: s.customer.user.id } })).toBe(1);
    });

    it('a retry still works after the cart changed, prices moved or the slot filled up', async () => {
      const s = await scenario({ slotCapacity: 1 });
      const key = randomUUID();
      const first = await place(s, {}, key).expect(201);
      await t.prisma.serviceItem.update({ where: { id: s.item.id }, data: { price: 500 } });
      const retry = await place(s, {}, key).expect(200); // slot is full (by this very order) and price changed: still a replay
      expect(retry.body.data.id).toBe(first.body.data.id);
    });

    it('refuses to reuse a key for a different order', async () => {
      const s = await scenario();
      const key = randomUUID();
      await place(s, {}, key).expect(201);
      const other = [
        { items: [{ serviceItemId: s.item.id, qty: 3 }], expectedTotal: '450.00' },
        { pickupSlotStart: '2026-10-24T07:00:00.000Z' },
      ];
      for (const change of other) {
        const res = await place(s, change, key).expect(422);
        expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      }
      expect(await t.prisma.order.count({ where: { customerId: s.customer.user.id } })).toBe(1);
    });

    it('keys are per customer', async () => {
      const a = await scenario();
      const b = await scenario();
      const key = randomUUID();
      const ra = await place(a, {}, key).expect(201);
      const rb = await place(b, {}, key).expect(201);
      expect(rb.body.data.id).not.toBe(ra.body.data.id);
    });

    it('five simultaneous requests with one key create exactly one order, even when the slot only has room for one', async () => {
      const s = await scenario({ slotCapacity: 1 });
      const key = randomUUID();
      const results = await Promise.all(Array.from({ length: 5 }, () => place(s, {}, key)));
      expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
      expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
      expect(await t.prisma.order.count({ where: { customerId: s.customer.user.id } })).toBe(1);
    });
  });

  describe('price protection', () => {
    it('refuses to charge a total the customer did not agree to', async () => {
      const s = await scenario();
      await t.prisma.serviceItem.update({ where: { id: s.item.id }, data: { price: 120 } });
      const res = await place(s).expect(409);
      expect(res.body.error).toMatchObject({
        code: 'PRICE_CHANGED',
        details: { expectedTotal: '350.00', total: '390.00', subtotal: '240.00', deliveryFee: '150.00' },
      });
      expect(await t.prisma.order.count({ where: { customerId: s.customer.user.id } })).toBe(0);
      // confirming the new total goes through
      const ok = await place(s, { expectedTotal: '390.00' }).expect(201);
      expect(ok.body.data.total).toBe('390.00');
    });

    it('also catches a changed delivery fee', async () => {
      const s = await scenario();
      await t.prisma.city.update({ where: { id: basics.cityId }, data: { deliveryFee: 200 } });
      try {
        expect((await place(s).expect(409)).body.error.details.total).toBe('400.00');
      } finally {
        await t.prisma.city.update({ where: { id: basics.cityId }, data: { deliveryFee: 150 } });
      }
    });

    it('accepts equivalent spellings of the same amount and rejects malformed ones', async () => {
      const s = await scenario();
      await place(s, { expectedTotal: '350' }).expect(201);
      await place(s, { expectedTotal: '350.0' }).expect(201);
      for (const bad of ['', 'abc', '-350', '350.001', '3.5e2', 350, null]) {
        expect((await place(s, { expectedTotal: bad }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
      }
    });
  });

  describe('what can be ordered', () => {
    it('is customers only', async () => {
      const s = await scenario();
      for (const role of [Role.VENDOR_OWNER, Role.RIDER, Role.ADMIN, Role.VENDOR_STAFF]) {
        const { auth } = await createUserWithToken(t, role);
        await http.post('/api/v1/orders').set(auth).set('Idempotency-Key', randomUUID()).send(body(s)).expect(403);
      }
      await http.post('/api/v1/orders').set('Idempotency-Key', randomUUID()).send(body(s)).expect(401);
    });

    it('only cash on delivery for now, and no promo codes', async () => {
      const s = await scenario();
      for (const method of ['CARD', 'JAZZCASH', 'EASYPAISA', 'RAAST']) {
        const res = await place(s, { paymentMethod: method }).expect(400);
        expect(res.body.error).toMatchObject({ code: 'PAYMENT_METHOD_UNAVAILABLE', details: { available: ['COD'] } });
      }
      expect((await place(s, { paymentMethod: 'BITCOIN' }).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
      expect((await place(s, { promoCode: 'SAVE10' }).expect(400)).body.error.code).toBe('PROMO_UNAVAILABLE');
    });

    it('rejects unknown or smuggled fields', async () => {
      const s = await scenario();
      for (const extra of [{ total: '1.00' }, { status: 'DELIVERED' }, { customerId: randomUUID() }, { vendorEarning: 999 }, { commissionAmount: 0 }]) {
        expect((await place(s, extra).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
      }
    });

    it('rejects bad items: empty, too many, bad quantity, duplicates beyond the cap', async () => {
      const s = await scenario();
      const id = s.item.id;
      for (const items of [[], [{ serviceItemId: id, qty: 0 }], [{ serviceItemId: id, qty: 51 }], [{ serviceItemId: 'nope', qty: 1 }], Array.from({ length: 31 }, () => ({ serviceItemId: id, qty: 1 }))]) {
        await place(s, { items }).expect(400);
      }
      const merged = await place(s, { items: [{ serviceItemId: id, qty: 30 }, { serviceItemId: id, qty: 30 }] }).expect(400);
      expect(merged.body.error.code).toBe('QUANTITY_TOO_LARGE');
    });

    it('items must belong to that vendor and still be active', async () => {
      const s = await scenario();
      const other = await scenario();
      const foreign = await place(s, { items: [{ serviceItemId: other.item.id, qty: 1 }], expectedTotal: '250.00' }).expect(422);
      expect(foreign.body.error).toMatchObject({ code: 'ITEM_UNAVAILABLE', details: { unavailable: [other.item.id] } });
      await t.prisma.serviceItem.update({ where: { id: s.item.id }, data: { isActive: false } });
      expect((await place(s).expect(422)).body.error.code).toBe('ITEM_UNAVAILABLE');
    });

    it('only from vendors that are approved, open and inside their hours', async () => {
      for (const [label, opts, expected] of [
        ['closed', { availability: 'CLOSED' as const }, { code: 'VENDOR_UNAVAILABLE', reason: 'NOT_OPEN' }],
        ['busy', { availability: 'BUSY' as const }, { code: 'VENDOR_UNAVAILABLE', reason: 'NOT_OPEN' }],
        ['outside hours', { hours: { opensAt: 0, closesAt: 60 } }, { code: 'VENDOR_UNAVAILABLE', reason: 'OUTSIDE_HOURS' }],
        ['no hours at all', { hours: 'none' as const }, { code: 'VENDOR_UNAVAILABLE', reason: 'OUTSIDE_HOURS' }],
      ] as const) {
        const s = await scenario(opts);
        const res = await place(s).expect(409);
        expect({ label, code: res.body.error.code, reason: res.body.error.details.reason }).toEqual({ label, ...expected });
        expect(await t.prisma.order.count({ where: { vendorId: s.vendor.vendor.id } })).toBe(0);
      }
      for (const status of ['PENDING', 'REJECTED', 'SUSPENDED'] as const) {
        const s = await scenario({ status });
        await place(s).expect(404);
      }
    });

    it('only inside the vendor’s service radius and city, to the customer’s own saved address', async () => {
      const s = await scenario({ radiusKm: 3 });
      const far = await createAddress(t, s.customer.user.id, basics.cityId, { lat: 31.52 + 0.05, lng: 74.35 }); // ~5.5 km
      const res = await place(s, { addressId: far.id }).expect(422);
      expect(res.body.error).toMatchObject({ code: 'OUT_OF_SERVICE_AREA', details: { serviceRadiusKm: 3 } });
      expect(res.body.error.details.distanceKm).toBeGreaterThan(5);

      const elsewhere = await t.prisma.city.upsert({ where: { name: 'Multan' }, update: {}, create: { name: 'Multan', code: 'MUX' } });
      const otherCity = await createAddress(t, s.customer.user.id, elsewhere.id);
      expect((await place(s, { addressId: otherCity.id }).expect(422)).body.error.code).toBe('OUT_OF_SERVICE_AREA');

      const stranger = await createCustomer(t);
      const theirs = await createAddress(t, stranger.user.id, basics.cityId);
      expect((await place(s, { addressId: theirs.id }).expect(422)).body.error.code).toBe('ADDRESS_NOT_FOUND');
      await t.prisma.address.update({ where: { id: s.address.id }, data: { deletedAt: new Date() } });
      expect((await place(s).expect(422)).body.error.code).toBe('ADDRESS_NOT_FOUND');
      expect(await t.prisma.order.count({ where: { customerId: s.customer.user.id } })).toBe(0);
    });
  });

  describe('slots', () => {
    it('pickup and delivery must be real windows the vendor offers', async () => {
      const s = await scenario({ hours: { opensAt: 540, closesAt: 1260 } }); // 09:00-21:00
      for (const pickupSlotStart of [
        '2026-10-24T05:30:00.000Z', // not on the grid
        '2026-10-24T03:00:00.000Z', // 08:00 local, before opening
        '2026-10-24T16:00:00.000Z', // 21:00 local, closing time
        '2026-10-22T05:00:00.000Z', // yesterday
        '2026-10-23T05:00:00.000Z', // now: inside the 1 h lead time
        '2026-10-31T05:00:00.000Z', // 8 days out
      ]) {
        const res = await place(s, { pickupSlotStart }).expect(422);
        expect({ pickupSlotStart, code: res.body.error.code, type: res.body.error.details.type }).toEqual({ pickupSlotStart, code: 'SLOT_UNAVAILABLE', type: 'pickup' });
      }
      expect(await t.prisma.order.count({ where: { customerId: s.customer.user.id } })).toBe(0);
    });

    it('delivery cannot be sooner than pickup end + the longest turnaround', async () => {
      const s = await scenario();
      for (const deliverySlotStart of [
        PICKUP, // same time as pickup
        '2026-10-26T05:00:00.000Z', // 1 h too early (needs pickupEnd 06:00Z Sat + 48 h = 06:00Z Mon)
        '2026-10-25T06:00:00.000Z', // only 24 h later
      ]) {
        const res = await place(s, { deliverySlotStart }).expect(422);
        expect(res.body.error).toMatchObject({ code: 'SLOT_UNAVAILABLE', details: { type: 'delivery' } });
      }
      await place(s, { deliverySlotStart: '2026-10-26T06:00:00.000Z' }).expect(201); // exactly on the limit
      await place(s, { deliverySlotStart: '2026-10-29T06:00:00.000Z' }).expect(201); // later is fine
    });

    it('cannot book far into the future by calling the API directly (pickup within 7 days, delivery within 7 days of earliest)', async () => {
      const s = await scenario();
      const pickupOk = await place(s, { pickupSlotStart: '2026-10-30T05:00:00.000Z', deliverySlotStart: '2026-11-02T06:00:00.000Z' }).expect(201);
      expect(pickupOk.body.data.pickupSlotStart).toBe('2026-10-30T05:00:00.000Z');
      const tooFar = await place(s, { pickupSlotStart: '2026-10-31T05:00:00.000Z', deliverySlotStart: '2026-11-03T06:00:00.000Z' }).expect(422);
      expect(tooFar.body.error).toMatchObject({ code: 'SLOT_UNAVAILABLE', details: { type: 'pickup' } });
      const deliveryTooFar = await place(s, { deliverySlotStart: '2026-11-20T06:00:00.000Z' }).expect(422);
      expect(deliveryTooFar.body.error).toMatchObject({ code: 'SLOT_UNAVAILABLE', details: { type: 'delivery' } });
    });

    it('a longer-turnaround item pushes the earliest delivery out', async () => {
      const s = await scenario({ items: [{ name: 'Shirt', price: 100 }, { name: 'Carpet', price: 2000, turnaroundHours: 96 }] });
      const items = [{ serviceItemId: s.vendor.items[0].id, qty: 1 }, { serviceItemId: s.vendor.items[1].id, qty: 1 }];
      const total = '2250.00'; // 100 + 2000 + 150
      expect((await place(s, { items, expectedTotal: total }).expect(422)).body.error.code).toBe('SLOT_UNAVAILABLE'); // 48 h not enough
      await place(s, { items, expectedTotal: total, deliverySlotStart: '2026-10-28T06:00:00.000Z' }).expect(201); // 96 h
    });

    it('a full slot is refused with SLOT_FULL; rejected or cancelled orders give the place back', async () => {
      const s = await scenario({ slotCapacity: 1 });
      const second = { customer: await createCustomer(t) } as unknown as Scenario;
      second.vendor = s.vendor;
      second.item = s.item;
      second.address = await createAddress(t, second.customer.user.id, basics.cityId);

      const first = await place(s).expect(201);
      const full = await place(second).expect(409);
      expect(full.body.error).toMatchObject({ code: 'SLOT_FULL', details: { type: 'pickup' } });

      await t.prisma.order.update({ where: { id: first.body.data.id }, data: { status: 'CANCELLED' } });
      await place(second).expect(201);
    });

    it('capacity holds under pressure: 6 customers, 2 places, exactly 2 orders', async () => {
      const s = await scenario({ slotCapacity: 2 });
      const rivals: Scenario[] = [];
      for (let i = 0; i < 6; i++) {
        const c = await createCustomer(t);
        rivals.push({ customer: c, vendor: s.vendor, item: s.item, address: await createAddress(t, c.user.id, basics.cityId) });
      }
      const results = await Promise.all(rivals.map((r) => place(r)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      expect(results.filter((r) => r.status === 409 && r.body.error.code === 'SLOT_FULL')).toHaveLength(4);
      expect(await t.prisma.order.count({ where: { vendorId: s.vendor.vendor.id } })).toBe(2);
    });
  });

  describe('safety', () => {
    it('a placement that fails midway leaves nothing behind and does not burn an order number', async () => {
      const s = await scenario();
      const first = (await place(s).expect(201)).body.data.orderNo as string;
      await t.prisma.commissionRule.deleteMany();
      try {
        const res = await place(s).expect(500);
        expect(res.body.error.code).toBe('COMMISSION_NOT_CONFIGURED');
        expect(await t.prisma.order.count({ where: { customerId: s.customer.user.id } })).toBe(1);
      } finally {
        await t.prisma.commissionRule.create({ data: { scope: 'GLOBAL', ratePct: 15, effectiveFrom: new Date('2026-01-01Z') } });
      }
      const next = (await place(s).expect(201)).body.data.orderNo as string;
      expect(Number(next.split('-')[2])).toBe(Number(first.split('-')[2]) + 1);
    });

    it('limits a customer to 10 placement attempts per minute', async () => {
      const s = await scenario();
      const wrong = { expectedTotal: '1.00' };
      for (let i = 0; i < 10; i++) await place(s, wrong).expect(409);
      const res = await place(s, wrong).expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('reading orders', () => {
    it('lists my orders newest first, pages with a cursor and filters by status', async () => {
      const s = await scenario();
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push((await place(s).expect(201)).body.data.id);
        await new Promise((r) => setTimeout(r, 15)); // distinct createdAt
      }
      await t.prisma.order.update({ where: { id: ids[1] }, data: { status: 'CANCELLED' } });

      const page1 = await http.get('/api/v1/orders?limit=2').set(s.customer.auth).expect(200);
      expect(page1.body.data.map((o: { id: string }) => o.id)).toEqual([ids[4], ids[3]]);
      expect(page1.body.meta.nextCursor).toEqual(expect.any(String));
      expect(page1.body.data[0]).toMatchObject({ status: 'PLACED', total: '350.00', itemCount: 1, currency: 'PKR', vendor: { id: s.vendor.vendor.id } });

      const seen: string[] = [...page1.body.data.map((o: { id: string }) => o.id)];
      let cursor = page1.body.meta.nextCursor as string | null;
      while (cursor) {
        const res = await http.get(`/api/v1/orders?limit=2&cursor=${encodeURIComponent(cursor)}`).set(s.customer.auth).expect(200);
        seen.push(...res.body.data.map((o: { id: string }) => o.id));
        cursor = res.body.meta.nextCursor;
      }
      expect(seen).toEqual([...ids].reverse());

      const cancelled = await http.get('/api/v1/orders?status=CANCELLED').set(s.customer.auth).expect(200);
      expect(cancelled.body.data.map((o: { id: string }) => o.id)).toEqual([ids[1]]);
      expect(cancelled.body.meta.nextCursor).toBeNull();
    });

    it('never shows anyone else’s orders', async () => {
      const mine = await scenario();
      const theirs = await scenario();
      const myOrder = (await place(mine).expect(201)).body.data.id;
      const theirOrder = (await place(theirs).expect(201)).body.data.id;

      const list = await http.get('/api/v1/orders').set(mine.customer.auth).expect(200);
      expect(list.body.data.map((o: { id: string }) => o.id)).toEqual([myOrder]);
      await http.get(`/api/v1/orders/${myOrder}`).set(mine.customer.auth).expect(200);
      const foreign = await http.get(`/api/v1/orders/${theirOrder}`).set(mine.customer.auth).expect(404);
      expect(foreign.body.error.code).toBe('NOT_FOUND');
      await http.get('/api/v1/orders/00000000-0000-4000-8000-000000000000').set(mine.customer.auth).expect(404);
      await http.get('/api/v1/orders/not-a-uuid').set(mine.customer.auth).expect(404);
    });

    it('is customers only and needs a login', async () => {
      const s = await scenario();
      const id = (await place(s).expect(201)).body.data.id;
      await http.get('/api/v1/orders').expect(401);
      await http.get(`/api/v1/orders/${id}`).expect(401);
      const admin = await createAdmin(t);
      await http.get('/api/v1/orders').set(admin.auth).expect(403);
      await http.get(`/api/v1/orders/${id}`).set(admin.auth).expect(403);
      await http.get(`/api/v1/orders/${id}`).set(s.vendor.owner.auth).expect(403);
    });

    it('validates list parameters', async () => {
      const { auth } = await createCustomer(t);
      for (const qs of ['limit=0', 'limit=51', 'status=NOPE', 'cursor=!!', 'extra=1']) {
        await http.get(`/api/v1/orders?${qs}`).set(auth).expect(400);
      }
      expect((await http.get('/api/v1/orders?cursor=garbage').set(auth).expect(400)).body.error.code).toBe('INVALID_CURSOR');
    });
  });
});
