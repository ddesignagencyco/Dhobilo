import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { Basics, NOW, TestApp, createCustomer, createLiveVendor, createTestApp, fixedClock, insertOrder, prepareReferenceData } from './helpers';

// "Now" is Friday 2026-10-23 10:00 in Karachi (05:00Z); Karachi is UTC+5 with no DST.
describe('Slots (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  const NINE_TO_NOON = { opensAt: 540, closesAt: 720 } as const; // 3 hourly slots: 09-10, 10-11, 11-12

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
  });
  beforeEach(() => clock.set(NOW));
  afterAll(() => t.close());

  const vendor = (opts: Parameters<typeof createLiveVendor>[2] = {}) =>
    createLiveVendor(t, basics, { hours: NINE_TO_NOON, slotCapacity: 2, ...opts });
  const slots = (id: string, q: Record<string, unknown>) => http.get(`/api/v1/vendors/${id}/slots`).query(q);
  const starts = (res: request.Response) => (res.body.data.slots as { start: string }[]).map((s) => s.start);

  describe('pickup', () => {
    it('lays out hourly windows from opening time, in UTC, with capacity', async () => {
      const v = await vendor();
      const res = await slots(v.vendor.id, { date: '2026-10-24', type: 'pickup' }).expect(200);
      expect(res.body.data).toMatchObject({ date: '2026-10-24', timezone: 'Asia/Karachi', type: 'pickup', slotMinutes: 60, capacity: 2 });
      expect(res.body.data.slots).toEqual([
        { start: '2026-10-24T04:00:00.000Z', end: '2026-10-24T05:00:00.000Z', available: true, remaining: 2 },
        { start: '2026-10-24T05:00:00.000Z', end: '2026-10-24T06:00:00.000Z', available: true, remaining: 2 },
        { start: '2026-10-24T06:00:00.000Z', end: '2026-10-24T07:00:00.000Z', available: true, remaining: 2 },
      ]);
    });

    it('needs no login', async () => {
      const v = await vendor();
      await slots(v.vendor.id, { date: '2026-10-24', type: 'pickup' }).expect(200);
    });

    it('drops windows that start less than an hour from now', async () => {
      const v = await vendor();
      // now = 10:00 local -> earliest start 11:00 local, so only 11-12 is left today
      const res = await slots(v.vendor.id, { date: '2026-10-23', type: 'pickup' }).expect(200);
      expect(starts(res)).toEqual(['2026-10-23T06:00:00.000Z']);

      clock.set(new Date('2026-10-23T05:30:00Z')); // 10:30 -> earliest 11:30 -> nothing today
      expect(starts(await slots(v.vendor.id, { date: '2026-10-23', type: 'pickup' }).expect(200))).toEqual([]);
    });

    it('allows today up to 7 days ahead, nothing outside', async () => {
      const v = await vendor();
      await slots(v.vendor.id, { date: '2026-10-30', type: 'pickup' }).expect(200);
      for (const date of ['2026-10-31', '2026-10-22', '2025-01-01']) {
        const res = await slots(v.vendor.id, { date, type: 'pickup' }).expect(400);
        expect(res.body.error.code).toBe('DATE_OUT_OF_RANGE');
      }
    });

    it('returns no slots on a day the vendor is closed', async () => {
      const v = await vendor();
      await t.prisma.vendorHours.deleteMany({ where: { vendorId: v.vendor.id, dayOfWeek: 0 } }); // Sunday
      expect(starts(await slots(v.vendor.id, { date: '2026-10-25', type: 'pickup' }).expect(200))).toEqual([]);
      expect(starts(await slots(v.vendor.id, { date: '2026-10-26', type: 'pickup' }).expect(200))).toHaveLength(3);
    });

    it('uses the local calendar day around midnight (late evening local is still "today")', async () => {
      clock.set(new Date('2026-10-23T18:30:00Z')); // 23:30 local Friday
      const v = await vendor({ hours: { opensAt: 0, closesAt: 1440 } });
      const today = await slots(v.vendor.id, { date: '2026-10-23', type: 'pickup' }).expect(200);
      expect(starts(today)).toEqual([]); // 00:30 earliest is already tomorrow
      const tomorrow = await slots(v.vendor.id, { date: '2026-10-24', type: 'pickup' }).expect(200);
      // earliest = 00:30 local Sat, so the 00:00 slot is dropped and 01:00 local Sat (= 20:00Z Friday) is the first
      expect(starts(tomorrow)[0]).toBe('2026-10-23T20:00:00.000Z');
      expect(starts(tomorrow)).toHaveLength(23);
    });
  });

  describe('capacity', () => {
    it('counts active orders per slot and marks full slots unavailable', async () => {
      const v = await vendor();
      const customer = await createCustomer(t);
      const slot = new Date('2026-10-24T05:00:00Z');
      const far = new Date('2026-10-27T05:00:00Z');
      await insertOrder(t, { vendorId: v.vendor.id, customerId: customer.user.id, cityId: basics.cityId, pickupSlotStart: slot, deliverySlotStart: far });

      let res = await slots(v.vendor.id, { date: '2026-10-24', type: 'pickup' }).expect(200);
      expect(res.body.data.slots.map((s: { remaining: number }) => s.remaining)).toEqual([2, 1, 2]);

      await insertOrder(t, { vendorId: v.vendor.id, customerId: customer.user.id, cityId: basics.cityId, pickupSlotStart: slot, deliverySlotStart: far });
      res = await slots(v.vendor.id, { date: '2026-10-24', type: 'pickup' }).expect(200);
      expect(res.body.data.slots[1]).toMatchObject({ available: false, remaining: 0 });
      expect(res.body.data.slots[0]).toMatchObject({ available: true, remaining: 2 });
    });

    it('rejected and cancelled orders free their slot; other vendors are unaffected', async () => {
      const v = await vendor();
      const other = await vendor();
      const customer = await createCustomer(t);
      const slot = new Date('2026-10-24T04:00:00Z');
      for (const status of ['REJECTED', 'CANCELLED'] as const) {
        await insertOrder(t, { vendorId: v.vendor.id, customerId: customer.user.id, cityId: basics.cityId, pickupSlotStart: slot, deliverySlotStart: new Date('2026-10-28T04:00:00Z'), status });
      }
      await insertOrder(t, { vendorId: other.vendor.id, customerId: customer.user.id, cityId: basics.cityId, pickupSlotStart: slot, deliverySlotStart: new Date('2026-10-28T04:00:00Z') });
      const res = await slots(v.vendor.id, { date: '2026-10-24', type: 'pickup' }).expect(200);
      expect(res.body.data.slots[0].remaining).toBe(2);
    });

    it('pickup and delivery capacity are counted separately', async () => {
      const v = await vendor();
      const customer = await createCustomer(t);
      const day = new Date('2026-10-26T05:00:00Z');
      await insertOrder(t, { vendorId: v.vendor.id, customerId: customer.user.id, cityId: basics.cityId, pickupSlotStart: new Date('2026-10-24T05:00:00Z'), deliverySlotStart: day });
      const q = { date: '2026-10-26', type: 'delivery', pickupEnd: '2026-10-24T06:00:00Z', turnaroundHours: 24 };
      const delivery = await slots(v.vendor.id, q).expect(200);
      expect(delivery.body.data.slots.find((s: { start: string }) => s.start === day.toISOString()).remaining).toBe(1);
      const pickup = await slots(v.vendor.id, { date: '2026-10-26', type: 'pickup' }).expect(200);
      expect(pickup.body.data.slots.every((s: { remaining: number }) => s.remaining === 2)).toBe(true);
    });
  });

  describe('delivery', () => {
    it('starts no earlier than pickup end + turnaround', async () => {
      const v = await vendor();
      const q = (date: string) => ({ date, type: 'delivery', pickupEnd: '2026-10-24T05:00:00Z', turnaroundHours: 24 });
      // earliest = 2026-10-25T05:00Z (10:00 local Sunday)
      expect(starts(await slots(v.vendor.id, q('2026-10-24')).expect(200))).toEqual([]);
      expect(starts(await slots(v.vendor.id, q('2026-10-25')).expect(200))).toEqual(['2026-10-25T05:00:00.000Z', '2026-10-25T06:00:00.000Z']);
      expect(starts(await slots(v.vendor.id, q('2026-10-26')).expect(200))).toHaveLength(3);
    });

    it('a longer turnaround pushes delivery later', async () => {
      const v = await vendor();
      const q = { date: '2026-10-26', type: 'delivery', pickupEnd: '2026-10-24T05:00:00Z', turnaroundHours: 72 };
      expect(starts(await slots(v.vendor.id, q).expect(200))).toEqual([]); // earliest 2026-10-27T05:00Z
      expect(starts(await slots(v.vendor.id, { ...q, date: '2026-10-27' }).expect(200))).toEqual(['2026-10-27T05:00:00.000Z', '2026-10-27T06:00:00.000Z']);
    });

    it('bounds the delivery date to 7 days after the earliest possible delivery, not after today', async () => {
      const v = await vendor();
      // pickup ends Fri 6 days out, 72 h turnaround -> earliest delivery is 9 days from now: still bookable
      const q = (date: string) => ({ date, type: 'delivery', pickupEnd: '2026-10-29T06:00:00Z', turnaroundHours: 72 });
      expect(starts(await slots(v.vendor.id, q('2026-11-01')).expect(200))).toEqual(['2026-11-01T06:00:00.000Z']); // 06:00Z is exactly pickup end + 72 h
      expect(starts(await slots(v.vendor.id, q('2026-11-08')).expect(200))).toHaveLength(3);
      const res = await slots(v.vendor.id, q('2026-11-09')).expect(400);
      expect(res.body.error.code).toBe('DATE_OUT_OF_RANGE');
    });

    it('needs pickupEnd and turnaroundHours', async () => {
      const v = await vendor();
      for (const extra of [{}, { pickupEnd: '2026-10-24T05:00:00Z' }, { turnaroundHours: 24 }]) {
        const res = await slots(v.vendor.id, { date: '2026-10-26', type: 'delivery', ...extra }).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    });
  });

  describe('validation', () => {
    it.each([
      ['no date', { type: 'pickup' }],
      ['a malformed date', { date: '24-10-2026', type: 'pickup' }],
      ['a date that does not exist', { date: '2026-02-30', type: 'pickup' }],
      ['an unknown type', { date: '2026-10-24', type: 'courier' }],
      ['a bad pickupEnd', { date: '2026-10-24', type: 'delivery', pickupEnd: 'soon', turnaroundHours: 24 }],
      ['a zero turnaround', { date: '2026-10-24', type: 'delivery', pickupEnd: '2026-10-24T05:00:00Z', turnaroundHours: 0 }],
      ['an unknown parameter', { date: '2026-10-24', type: 'pickup', extra: 1 }],
    ])('rejects %s', async (_label, q) => {
      const v = await vendor();
      const res = await slots(v.vendor.id, q).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('404s for unknown, unapproved and malformed vendors', async () => {
      const pending = await vendor({ status: 'PENDING' });
      await slots(pending.vendor.id, { date: '2026-10-24', type: 'pickup' }).expect(404);
      await slots('00000000-0000-4000-8000-000000000000', { date: '2026-10-24', type: 'pickup' }).expect(404);
      await slots('not-a-uuid', { date: '2026-10-24', type: 'pickup' }).expect(400);
    });
  });
});
