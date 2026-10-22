import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { OrderLifecycleService } from '../src/modules/orders/lifecycle/order-lifecycle.service';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createLiveVendor, createTestApp, createUserWithToken, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, addStaff, anotherCustomer, orderScenario, placeOrder } from './order-helpers';

describe('Order lifecycle (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  const changes: { orderId: string; from: string; to: string; actor: string; seq: number }[] = [];

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    t.app.get(EventEmitter2).on('order.status_changed', (e) => changes.push(e));
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterAll(() => t.close());

  const scenario = (opts: Parameters<typeof orderScenario>[2] = {}) => orderScenario(t, basics, opts);
  const place = (s: OrderScenario, extra: Record<string, unknown> = {}) => placeOrder(http, s, extra);
  const vendorPost = (s: OrderScenario, id: string, action: string, body: object = {}) =>
    http.post(`/api/v1/vendor/orders/${id}/${action}`).set(s.vendor.owner.auth).send(body);
  const advance = (s: OrderScenario, id: string, status: string) => vendorPost(s, id, 'status', { status });
  const statusOf = async (id: string) => (await t.prisma.order.findUniqueOrThrow({ where: { id } })).status;
  const historyOf = (id: string) => t.prisma.orderStatusHistory.findMany({ where: { orderId: id }, orderBy: { seq: 'asc' } });

  describe('vendor board', () => {
    it('lists waiting orders most-urgent first and shows tab counts', async () => {
      const s = await scenario();
      const first = await place(s);
      const second = await place(s);
      // make the second order's deadline earlier than the first's
      await t.prisma.order.update({ where: { id: second.id }, data: { vendorRespondBy: new Date(NOW.getTime() + 60_000) } });

      const waiting = await http.get('/api/v1/vendor/orders?status=PLACED').set(s.vendor.owner.auth).expect(200);
      expect(waiting.body.data.map((o: { id: string }) => o.id)).toEqual([second.id, first.id]);
      expect(waiting.body.meta.nextCursor).toBeNull();
      expect(waiting.body.data[0]).toMatchObject({ status: 'PLACED', total: '350.00', itemCount: 1, customerName: null });
      expect(waiting.body.data[0].respondBy).toEqual(expect.any(String));

      await vendorPost(s, first.id, 'accept').expect(200);
      const counts = (await http.get('/api/v1/vendor/orders/counts').set(s.vendor.owner.auth).expect(200)).body.data;
      expect(counts).toMatchObject({ PLACED: 1, ACCEPTED: 1, REJECTED: 0, PICKED_UP: 0, DELIVERED: 0, CANCELLED: 0 });
      expect(Object.keys(counts).sort()).toEqual(['ACCEPTED', 'CANCELLED', 'DELIVERED', 'IN_PROCESS', 'OUT_FOR_DELIVERY', 'PICKED_UP', 'PLACED', 'READY', 'REJECTED']);
    });

    it('pages the rest newest first, with multi-status filters', async () => {
      const s = await scenario();
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const o = await place(s);
        ids.push(o.id);
        await vendorPost(s, o.id, 'accept').expect(200);
        await new Promise((r) => setTimeout(r, 15));
      }
      const p1 = await http.get('/api/v1/vendor/orders?status=ACCEPTED,PICKED_UP&limit=3').set(s.vendor.owner.auth).expect(200);
      expect(p1.body.data.map((o: { id: string }) => o.id)).toEqual([ids[3], ids[2], ids[1]]);
      const p2 = await http.get(`/api/v1/vendor/orders?status=ACCEPTED&limit=3&cursor=${encodeURIComponent(p1.body.meta.nextCursor)}`).set(s.vendor.owner.auth).expect(200);
      expect(p2.body.data.map((o: { id: string }) => o.id)).toEqual([ids[0]]);
      expect(p2.body.data[0].respondBy).toBeNull(); // only meaningful while waiting
      const none = await http.get('/api/v1/vendor/orders?status=DELIVERED').set(s.vendor.owner.auth).expect(200);
      expect(none.body.data).toEqual([]);
    });

    it('detail shows what the vendor needs: masked customer phone, money incl. commission, next actions, timeline', async () => {
      const s = await scenario();
      await t.prisma.user.update({ where: { id: s.customer.user.id }, data: { name: 'Ayesha Khan' } });
      const o = await place(s, { customerNote: 'Fold gently' });
      const d = (await http.get(`/api/v1/vendor/orders/${o.id}`).set(s.vendor.owner.auth).expect(200)).body.data;

      expect(d).toMatchObject({
        id: o.id,
        status: 'PLACED',
        currency: 'PKR',
        subtotal: '200.00',
        deliveryFee: '150.00',
        total: '350.00',
        commissionRatePct: '15.00',
        commissionAmount: '30.00',
        vendorEarning: '170.00',
        customerNote: 'Fold gently',
        nextActions: expect.arrayContaining(['ACCEPTED', 'REJECTED']),
        customer: { name: 'Ayesha Khan' },
      });
      expect(d.customer.phone).toMatch(/^\+92300\*\*\*\d{4}$/);
      expect(d.customer.phone).not.toBe(s.customer.user.phone);
      expect(d.timeline).toEqual([expect.objectContaining({ status: 'PLACED', from: null, by: 'CUSTOMER' })]);
      expect(d.items).toEqual([expect.objectContaining({ name: 'Shirt', unitPrice: '100.00', qty: 2, lineTotal: '200.00' })]);
      expect(JSON.stringify(d)).not.toContain(s.customer.user.phone);
    });

    it('is private to the vendor: others get 404, wrong roles 403, no login 401', async () => {
      const a = await scenario();
      const b = await scenario();
      const o = await place(a);
      await http.get(`/api/v1/vendor/orders/${o.id}`).set(b.vendor.owner.auth).expect(404);
      await vendorPost(b, o.id, 'accept').expect(404);
      await vendorPost(b, o.id, 'reject', { reason: 'not mine at all' }).expect(404);
      await vendorPost(b, o.id, 'status', { status: 'READY' }).expect(404);
      expect(await statusOf(o.id)).toBe('PLACED');
      expect((await http.get('/api/v1/vendor/orders').set(b.vendor.owner.auth).expect(200)).body.data).toEqual([]);
      await http.get('/api/v1/vendor/orders/not-a-uuid').set(a.vendor.owner.auth).expect(404);
      for (const role of [Role.CUSTOMER, Role.RIDER, Role.ADMIN]) {
        const { auth } = await createUserWithToken(t, role);
        await http.get('/api/v1/vendor/orders').set(auth).expect(403);
      }
      await http.get('/api/v1/vendor/orders').expect(401);
    });

    it('vendor staff work the board too', async () => {
      const s = await scenario();
      const staff = await addStaff(t, s);
      const o = await place(s);
      await http.get('/api/v1/vendor/orders?status=PLACED').set(staff.auth).expect(200);
      await http.post(`/api/v1/vendor/orders/${o.id}/accept`).set(staff.auth).expect(200);
      expect((await historyOf(o.id)).at(-1)).toMatchObject({ toStatus: 'ACCEPTED', actorId: staff.user.id, actorRole: 'VENDOR_STAFF' });
    });

    it('validates filters', async () => {
      const s = await scenario();
      for (const qs of ['status=NOPE', 'status=PLACED,NOPE', 'limit=0', 'limit=51', 'cursor=!!', 'extra=1']) {
        await http.get(`/api/v1/vendor/orders?${qs}`).set(s.vendor.owner.auth).expect(400);
      }
    });
  });

  describe('accepting and rejecting', () => {
    it('accept moves PLACED -> ACCEPTED, stamps the time, records who, and announces the change', async () => {
      const s = await scenario();
      const o = await place(s);
      const before = changes.length;
      const res = await vendorPost(s, o.id, 'accept').expect(200);
      expect(res.body.data).toMatchObject({ status: 'ACCEPTED', nextActions: ['PICKED_UP'] });
      expect(res.body.data.acceptedAt).toEqual(expect.any(String));

      const history = await historyOf(o.id);
      expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([[null, 'PLACED'], ['PLACED', 'ACCEPTED']]);
      expect(history[1]).toMatchObject({ actorId: s.vendor.owner.user.id, actorRole: 'VENDOR_OWNER' });
      expect(history[1].seq).toBeGreaterThan(history[0].seq);
      expect(changes.slice(before)).toEqual([expect.objectContaining({ orderId: o.id, from: 'PLACED', to: 'ACCEPTED', actor: 'VENDOR', seq: history[1].seq })]);

      const customerView = await http.get(`/api/v1/orders/${o.id}`).set(s.customer.auth).expect(200);
      expect(customerView.body.data.status).toBe('ACCEPTED');
    });

    it('cannot accept twice, or accept after rejecting', async () => {
      const s = await scenario();
      const o = await place(s);
      await vendorPost(s, o.id, 'accept').expect(200);
      const again = await vendorPost(s, o.id, 'accept').expect(409);
      expect(again.body.error).toMatchObject({ code: 'ORDER_INVALID_TRANSITION', details: { from: 'ACCEPTED', to: 'ACCEPTED' } });
      expect(await historyOf(o.id)).toHaveLength(2);
    });

    it('reject needs a reason, stores it, and shows it to the customer', async () => {
      const s = await scenario();
      const o = await place(s);
      for (const body of [{}, { reason: '' }, { reason: 'no' }, { reason: 'x'.repeat(301) }, { reason: 'ok reason', extra: 1 }]) {
        expect((await vendorPost(s, o.id, 'reject', body).expect(400)).body.error.code).toBe('VALIDATION_FAILED');
      }
      expect(await statusOf(o.id)).toBe('PLACED');

      const res = await vendorPost(s, o.id, 'reject', { reason: '  We are fully booked this week  ' }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'REJECTED', rejectionReason: 'We are fully booked this week', nextActions: [] });
      const customerView = (await http.get(`/api/v1/orders/${o.id}`).set(s.customer.auth).expect(200)).body.data;
      expect(customerView).toMatchObject({ status: 'REJECTED', rejectionReason: 'We are fully booked this week' });
      expect((await historyOf(o.id)).at(-1)).toMatchObject({ toStatus: 'REJECTED', note: 'We are fully booked this week' });
    });

    it('a rejected order gives its slot back', async () => {
      const s = await scenario({ slotCapacity: 1 });
      const o = await place(s);
      const rival = await anotherCustomer(t, basics, s);
      await http.post('/api/v1/orders').set(rival.customer.auth).set('Idempotency-Key', 'rival-key-000001').send({
        vendorId: s.vendor.vendor.id, addressId: rival.address.id, items: [{ serviceItemId: s.item.id, qty: 2 }],
        pickupSlotStart: '2026-10-24T05:00:00.000Z', deliverySlotStart: '2026-10-26T06:00:00.000Z', paymentMethod: 'COD', expectedTotal: '350.00',
      }).expect(409);
      await vendorPost(s, o.id, 'reject', { reason: 'Cannot take it today' }).expect(200);
      await place(rival);
    });

    it('accept and reject racing: exactly one wins and history stays consistent', async () => {
      const s = await scenario();
      const o = await place(s);
      const results = await Promise.all([vendorPost(s, o.id, 'accept'), vendorPost(s, o.id, 'reject', { reason: 'Changed my mind' })]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await historyOf(o.id))).toHaveLength(2);
      expect(['ACCEPTED', 'REJECTED']).toContain(await statusOf(o.id));
    });

    it('many simultaneous accepts: one transition, one history row', async () => {
      const s = await scenario();
      const o = await place(s);
      const results = await Promise.all(Array.from({ length: 6 }, () => vendorPost(s, o.id, 'accept')));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);
      expect(await historyOf(o.id)).toHaveLength(2);
    });
  });

  describe('working an accepted order', () => {
    it('walks received -> in process -> ready -> handed to rider, one step at a time, with timestamps', async () => {
      const s = await scenario();
      const o = await place(s);
      await vendorPost(s, o.id, 'accept').expect(200);

      const steps = [
        ['PICKED_UP', 'pickedUpAt', 'IN_PROCESS'],
        ['IN_PROCESS', null, 'READY'],
        ['READY', 'readyAt', 'OUT_FOR_DELIVERY'],
        ['OUT_FOR_DELIVERY', null, null],
      ] as const;
      for (const [status, stamp, next] of steps) {
        const res = await advance(s, o.id, status).expect(200);
        expect(res.body.data.status).toBe(status);
        if (stamp) expect(res.body.data[stamp]).toEqual(expect.any(String));
        expect(res.body.data.nextActions).toEqual(next ? [next] : []); // after OUT_FOR_DELIVERY only a rider/admin can finish
      }
      expect((await historyOf(o.id)).map((h) => h.toStatus)).toEqual(['PLACED', 'ACCEPTED', 'PICKED_UP', 'IN_PROCESS', 'READY', 'OUT_FOR_DELIVERY']);
    });

    it('refuses skipping or repeating a step, going backwards, or finishing the delivery', async () => {
      const s = await scenario();
      const o = await place(s);
      expect((await advance(s, o.id, 'PICKED_UP').expect(409)).body.error.code).toBe('ORDER_INVALID_TRANSITION'); // not accepted yet
      await vendorPost(s, o.id, 'accept').expect(200);
      expect((await advance(s, o.id, 'READY').expect(409)).body.error.code).toBe('ORDER_INVALID_TRANSITION'); // skipping
      await advance(s, o.id, 'PICKED_UP').expect(200);
      await advance(s, o.id, 'PICKED_UP').expect(409); // repeating
      await advance(s, o.id, 'IN_PROCESS').expect(200);
      await vendorPost(s, o.id, 'reject', { reason: 'Too late to reject now' }).expect(409); // no longer waiting
      await advance(s, o.id, 'PICKED_UP').expect(409); // backwards
      await advance(s, o.id, 'READY').expect(200);
      await advance(s, o.id, 'OUT_FOR_DELIVERY').expect(200);
      for (const status of ['DELIVERED', 'CANCELLED', 'PLACED', 'NOPE']) {
        const res = await advance(s, o.id, status).expect(400); // not a step vendors may request at all
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
      expect(await statusOf(o.id)).toBe('OUT_FOR_DELIVERY');
    });

    it('delivery is completed by a rider or admin, never the vendor; DELIVERED is final', async () => {
      const s = await scenario();
      const o = await place(s);
      await vendorPost(s, o.id, 'accept').expect(200);
      for (const st of ['PICKED_UP', 'IN_PROCESS', 'READY', 'OUT_FOR_DELIVERY']) await advance(s, o.id, st).expect(200);

      const lifecycle = t.app.get(OrderLifecycleService);
      await expect(lifecycle.transition(o.id, 'DELIVERED', { kind: 'VENDOR', userId: s.vendor.owner.user.id, role: 'VENDOR_OWNER' })).rejects.toMatchObject({ code: 'ORDER_INVALID_TRANSITION' });
      const done = await lifecycle.transition(o.id, 'DELIVERED', { kind: 'RIDER', userId: admin.user.id, role: 'RIDER' });
      expect(done.to).toBe('DELIVERED');
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).deliveredAt).not.toBeNull();

      for (const target of ['CANCELLED', 'REJECTED', 'ACCEPTED', 'READY'] as const) {
        await expect(lifecycle.transition(o.id, target, { kind: 'ADMIN', userId: admin.user.id, role: 'ADMIN' }, { reason: 'force it through' })).rejects.toMatchObject({ code: 'ORDER_INVALID_TRANSITION' });
      }
      expect(await statusOf(o.id)).toBe('DELIVERED');
      await http.post(`/api/v1/orders/${o.id}/cancel`).set(s.customer.auth).send({}).expect(409);
    });

    it('a suspended vendor can finish orders already in progress but cannot take new ones', async () => {
      const s = await scenario();
      const inFlight = await place(s);
      const fresh = await place(s);
      await vendorPost(s, inFlight.id, 'accept').expect(200);
      await t.prisma.vendor.update({ where: { id: s.vendor.vendor.id }, data: { status: 'SUSPENDED' } });

      await http.get('/api/v1/vendor/orders').set(s.vendor.owner.auth).expect(200);
      await advance(s, inFlight.id, 'PICKED_UP').expect(200);
      for (const call of [() => vendorPost(s, fresh.id, 'accept'), () => vendorPost(s, fresh.id, 'reject', { reason: 'closing down' })]) {
        const res = await call().expect(403);
        expect(res.body.error).toMatchObject({ code: 'VENDOR_NOT_ACTIVE', details: { status: 'SUSPENDED' } });
      }
      expect(await statusOf(fresh.id)).toBe('PLACED');
    });

    it('a pending or rejected vendor has no board at all', async () => {
      const v = await createLiveVendor(t, basics, { status: 'PENDING' });
      const res = await http.get('/api/v1/vendor/orders').set(v.owner.auth).expect(403);
      expect(res.body.error.code).toBe('VENDOR_NOT_ACTIVE');
    });
  });

  describe('customer cancellation', () => {
    it('can cancel while PLACED or ACCEPTED, with an optional reason the vendor sees', async () => {
      const s = await scenario();
      const waiting = await place(s);
      const res = await http.post(`/api/v1/orders/${waiting.id}/cancel`).set(s.customer.auth).send({ reason: ' Plans changed ' }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'Plans changed' });

      const accepted = await place(s);
      await vendorPost(s, accepted.id, 'accept').expect(200);
      await http.post(`/api/v1/orders/${accepted.id}/cancel`).set(s.customer.auth).send({}).expect(200);
      expect((await historyOf(accepted.id)).at(-1)).toMatchObject({ toStatus: 'CANCELLED', actorId: s.customer.user.id, actorRole: 'CUSTOMER', note: null });
      const vendorView = await http.get(`/api/v1/vendor/orders/${waiting.id}`).set(s.vendor.owner.auth).expect(200);
      expect(vendorView.body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'Plans changed' });
    });

    it('cannot cancel once the laundry is picked up, or twice', async () => {
      const s = await scenario();
      const o = await place(s);
      await vendorPost(s, o.id, 'accept').expect(200);
      await advance(s, o.id, 'PICKED_UP').expect(200);
      const res = await http.post(`/api/v1/orders/${o.id}/cancel`).set(s.customer.auth).send({}).expect(409);
      expect(res.body.error).toMatchObject({ code: 'ORDER_INVALID_TRANSITION', details: { from: 'PICKED_UP', to: 'CANCELLED' } });

      const other = await place(s);
      await http.post(`/api/v1/orders/${other.id}/cancel`).set(s.customer.auth).send({}).expect(200);
      await http.post(`/api/v1/orders/${other.id}/cancel`).set(s.customer.auth).send({}).expect(409);
    });

    it('only the customer who placed it can cancel; vendors and others cannot', async () => {
      const s = await scenario();
      const o = await place(s);
      const stranger = await anotherCustomer(t, basics, s);
      await http.post(`/api/v1/orders/${o.id}/cancel`).set(stranger.customer.auth).send({}).expect(404);
      await http.post(`/api/v1/orders/${o.id}/cancel`).set(s.vendor.owner.auth).send({}).expect(403);
      await http.post(`/api/v1/orders/${o.id}/cancel`).set(admin.auth).send({}).expect(403);
      await http.post(`/api/v1/orders/${o.id}/cancel`).send({}).expect(401);
      expect(await statusOf(o.id)).toBe('PLACED');
    });

    it('frees the slot, and cancel racing a vendor accept leaves one consistent outcome', async () => {
      const s = await scenario();
      const o = await place(s);
      const results = await Promise.all([vendorPost(s, o.id, 'accept'), http.post(`/api/v1/orders/${o.id}/cancel`).set(s.customer.auth).send({})]);
      // either order of arrival is legal (accept then cancel, or cancel then a failed accept)
      expect(await statusOf(o.id)).toMatch(/^(ACCEPTED|CANCELLED)$/);
      expect((await historyOf(o.id)).length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.status === 200)).toBe(true);
    });

    it('validates the body', async () => {
      const s = await scenario();
      const o = await place(s);
      for (const body of [{ reason: 'x'.repeat(201) }, { reason: 5 }, { status: 'DELIVERED' }]) {
        await http.post(`/api/v1/orders/${o.id}/cancel`).set(s.customer.auth).send(body).expect(400);
      }
    });
  });

  describe('admin support tools', () => {
    it('finds orders by number, status, vendor and customer, newest first with paging', async () => {
      const s = await scenario();
      const a = await place(s);
      const b = await place(s);
      await vendorPost(s, a.id, 'accept').expect(200);

      const byNo = await http.get(`/api/v1/admin/orders?orderNo=${b.orderNo.slice(-6)}`).set(admin.auth).expect(200);
      expect(byNo.body.data.map((o: { id: string }) => o.id)).toContain(b.id);
      const mine = await http.get(`/api/v1/admin/orders?vendorId=${s.vendor.vendor.id}&limit=1`).set(admin.auth).expect(200);
      expect(mine.body.data).toHaveLength(1);
      expect(mine.body.meta.nextCursor).toEqual(expect.any(String));
      const accepted = await http.get(`/api/v1/admin/orders?vendorId=${s.vendor.vendor.id}&customerId=${s.customer.user.id}&status=ACCEPTED`).set(admin.auth).expect(200);
      expect(accepted.body.data.map((o: { id: string }) => o.id)).toEqual([a.id]);
      expect(accepted.body.data[0]).toMatchObject({ total: '350.00', customer: { phone: s.customer.user.phone }, vendor: { businessName: s.vendor.vendor.businessName } });
    });

    it('detail exposes everything, including commission, payments and full history with actors', async () => {
      const s = await scenario();
      const o = await place(s);
      await vendorPost(s, o.id, 'accept').expect(200);
      const d = (await http.get(`/api/v1/admin/orders/${o.id}`).set(admin.auth).expect(200)).body.data;
      expect(d).toMatchObject({ commissionRatePct: '15.00', commissionAmount: '30.00', vendorEarning: '170.00', nextActions: expect.arrayContaining(['PICKED_UP', 'CANCELLED']) });
      expect(d.payments).toEqual([expect.objectContaining({ gateway: 'cod', amount: '350.00' })]);
      expect(d.timeline.map((h: { status: string; by: string }) => [h.status, h.by])).toEqual([['PLACED', 'CUSTOMER'], ['ACCEPTED', 'VENDOR']]);
      await http.get('/api/v1/admin/orders/00000000-0000-4000-8000-000000000000').set(admin.auth).expect(404);
      await http.get('/api/v1/admin/orders/not-a-uuid').set(admin.auth).expect(404);
    });

    it('cancels on behalf of anyone, with a required reason that both sides see', async () => {
      const s = await scenario();
      const o = await place(s);
      await vendorPost(s, o.id, 'accept').expect(200);
      for (const body of [{}, { reason: 'no' }]) await http.post(`/api/v1/admin/orders/${o.id}/cancel`).set(admin.auth).send(body).expect(400);
      expect(await statusOf(o.id)).toBe('ACCEPTED');

      const res = await http.post(`/api/v1/admin/orders/${o.id}/cancel`).set(admin.auth).send({ reason: 'Customer phoned support to cancel' }).expect(200);
      expect(res.body.data.status).toBe('CANCELLED');
      expect((await http.get(`/api/v1/orders/${o.id}`).set(s.customer.auth)).body.data).toMatchObject({ status: 'CANCELLED', cancelReason: 'Customer phoned support to cancel' });
      expect((await historyOf(o.id)).at(-1)).toMatchObject({ actorId: admin.user.id, actorRole: 'ADMIN' });
    });

    it('cannot cancel an order that is already being worked on or finished', async () => {
      const s = await scenario();
      const o = await place(s);
      await vendorPost(s, o.id, 'accept').expect(200);
      await advance(s, o.id, 'PICKED_UP').expect(200);
      const res = await http.post(`/api/v1/admin/orders/${o.id}/cancel`).set(admin.auth).send({ reason: 'Too late really' }).expect(409);
      expect(res.body.error.code).toBe('ORDER_INVALID_TRANSITION');
    });

    it('is admin only', async () => {
      const s = await scenario();
      const o = await place(s);
      for (const auth of [s.customer.auth, s.vendor.owner.auth]) {
        await http.get('/api/v1/admin/orders').set(auth).expect(403);
        await http.get(`/api/v1/admin/orders/${o.id}`).set(auth).expect(403);
        await http.post(`/api/v1/admin/orders/${o.id}/cancel`).set(auth).send({ reason: 'hello there' }).expect(403);
      }
      await http.get('/api/v1/admin/orders').expect(401);
    });
  });

  describe('timeline', () => {
    it('is visible to the customer, the vendor’s people and admins, and no one else', async () => {
      const s = await scenario();
      const staff = await addStaff(t, s);
      const o = await place(s);
      await vendorPost(s, o.id, 'accept').expect(200);

      const expected = [
        { status: 'PLACED', from: null, by: 'CUSTOMER' },
        { status: 'ACCEPTED', from: 'PLACED', by: 'VENDOR' },
      ];
      for (const auth of [s.customer.auth, s.vendor.owner.auth, staff.auth, admin.auth]) {
        const res = await http.get(`/api/v1/orders/${o.id}/timeline`).set(auth).expect(200);
        expect(res.body.data).toEqual(expected.map((e) => expect.objectContaining(e)));
        expect(JSON.stringify(res.body)).not.toMatch(/actorId|userId/);
      }
      const stranger = await anotherCustomer(t, basics, s);
      const otherVendor = await scenario();
      for (const auth of [stranger.customer.auth, otherVendor.vendor.owner.auth, otherVendor.customer.auth]) {
        await http.get(`/api/v1/orders/${o.id}/timeline`).set(auth).expect(404);
      }
      const rider = await createUserWithToken(t, Role.RIDER);
      await http.get(`/api/v1/orders/${o.id}/timeline`).set(rider.auth).expect(403);
      await http.get(`/api/v1/orders/${o.id}/timeline`).expect(401);
      await http.get('/api/v1/orders/not-a-uuid/timeline').set(s.customer.auth).expect(404);
    });
  });

  describe('reorder', () => {
    it('refills the cart from an old order and reports gone items and price changes', async () => {
      const s = await scenario({
        items: [
          { name: 'Shirt', price: 100 },
          { name: 'Trouser', price: 140 },
          { name: 'Suit', price: 1000, serviceType: 'DRY_CLEAN', categoryId: basics.dryCleanId },
        ],
      });
      const [shirt, trouser, suit] = s.vendor.items;
      const o = await place(s, { items: [{ serviceItemId: shirt.id, qty: 2 }, { serviceItemId: trouser.id, qty: 1 }, { serviceItemId: suit.id, qty: 1 }], expectedTotal: '1490.00' });

      await t.prisma.serviceItem.update({ where: { id: shirt.id }, data: { price: 120 } });
      await t.prisma.serviceItem.update({ where: { id: suit.id }, data: { deletedAt: new Date(), isActive: false } });

      const res = await http.post(`/api/v1/orders/${o.id}/reorder`).set(s.customer.auth).expect(200);
      expect(res.body.data.unavailable).toEqual([{ name: 'Suit' }]);
      expect(res.body.data.priceChanges).toEqual([{ name: 'Shirt', oldUnitPrice: '100.00', newUnitPrice: '120.00' }]);
      expect(res.body.data.cart).toMatchObject({ vendorId: s.vendor.vendor.id, subtotal: '380.00', unavailableCount: 0 });
      expect(res.body.data.cart.items.map((i: { name: string; qty: number }) => [i.name, i.qty]).sort()).toEqual([['Shirt', 2], ['Trouser', 1]]);

      // the old order is untouched, and the new cart replaces any existing one for that vendor
      expect((await http.get(`/api/v1/orders/${o.id}`).set(s.customer.auth)).body.data.total).toBe('1490.00');
      await http.post(`/api/v1/orders/${o.id}/reorder`).set(s.customer.auth).expect(200);
      expect((await http.get('/api/v1/cart').set(s.customer.auth)).body.data).toHaveLength(1);
    });

    it('works for any past order, even a rejected or cancelled one', async () => {
      const s = await scenario();
      const o = await place(s);
      await vendorPost(s, o.id, 'reject', { reason: 'Fully booked today' }).expect(200);
      const res = await http.post(`/api/v1/orders/${o.id}/reorder`).set(s.customer.auth).expect(200);
      expect(res.body.data.cart.items).toHaveLength(1);
    });

    it('says clearly when nothing can be carried over, or the vendor is gone', async () => {
      const s = await scenario();
      const o = await place(s);
      await t.prisma.serviceItem.update({ where: { id: s.item.id }, data: { isActive: false } });
      const none = await http.post(`/api/v1/orders/${o.id}/reorder`).set(s.customer.auth).expect(422);
      expect(none.body.error).toMatchObject({ code: 'NOTHING_TO_REORDER', details: { unavailable: [{ name: 'Shirt' }] } });

      await t.prisma.serviceItem.update({ where: { id: s.item.id }, data: { isActive: true } });
      await t.prisma.vendor.update({ where: { id: s.vendor.vendor.id }, data: { status: 'SUSPENDED' } });
      await http.post(`/api/v1/orders/${o.id}/reorder`).set(s.customer.auth).expect(404);
    });

    it('is only for your own orders', async () => {
      const s = await scenario();
      const o = await place(s);
      const stranger = await anotherCustomer(t, basics, s);
      await http.post(`/api/v1/orders/${o.id}/reorder`).set(stranger.customer.auth).expect(404);
      await http.post(`/api/v1/orders/${o.id}/reorder`).set(s.vendor.owner.auth).expect(403);
      await http.post(`/api/v1/orders/${o.id}/reorder`).expect(401);
    });
  });

  describe('order history filters', () => {
    it('filters my orders by vendor and by date range', async () => {
      const s = await scenario();
      const other = await createLiveVendor(t, basics);
      const mine = await place(s);
      await t.prisma.order.update({ where: { id: mine.id }, data: { placedAt: new Date('2026-09-15T10:00:00Z') } });
      const recent = await place(s);

      const byVendor = await http.get(`/api/v1/orders?vendorId=${s.vendor.vendor.id}`).set(s.customer.auth).expect(200);
      expect(byVendor.body.data).toHaveLength(2);
      expect((await http.get(`/api/v1/orders?vendorId=${other.vendor.id}`).set(s.customer.auth)).body.data).toEqual([]);

      const range = await http.get('/api/v1/orders?from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z').set(s.customer.auth).expect(200);
      expect(range.body.data.map((o: { id: string }) => o.id)).toEqual([mine.id]);
      const fromOnly = await http.get('/api/v1/orders?from=2026-10-01T00:00:00Z').set(s.customer.auth).expect(200);
      expect(fromOnly.body.data.map((o: { id: string }) => o.id)).toEqual([recent.id]);
      for (const qs of ['from=yesterday', 'to=2026-13-45', 'vendorId=nope']) await http.get(`/api/v1/orders?${qs}`).set(s.customer.auth).expect(400);
    });
  });

  it('history sequence numbers only ever grow, across orders', async () => {
    const s = await scenario();
    const a = await place(s);
    const b = await place(s);
    await vendorPost(s, a.id, 'accept').expect(200);
    await vendorPost(s, b.id, 'accept').expect(200);
    const all = [...(await historyOf(a.id)), ...(await historyOf(b.id))].map((h) => h.seq);
    expect(new Set(all).size).toBe(all.length);
    const rows = await t.prisma.orderStatusHistory.findMany({ where: { orderId: { in: [a.id, b.id] } }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.seq)).toEqual([...rows.map((r) => r.seq)].sort((x, y) => x - y));
  });
});
