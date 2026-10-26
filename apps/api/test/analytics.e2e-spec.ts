import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { QUEUES } from '../src/infra/queue/queues';
import { AnalyticsProcessor } from '../src/modules/analytics/analytics.processor';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { Basics, TestApp, clearRateLimits, createAdmin, createCustomer, createLiveVendor, createTestApp, fixedClock, prepareReferenceData } from './helpers';

/**
 * QA-8.1: the dashboard numbers are checked against the same sums taken straight from the orders table. The orders
 * below sit in March 2026 (Pakistan time), far from any other suite's data, so every total here is exact.
 * Day boundaries are Pakistan time (UTC+5): 2020-03-02 runs from 03-01T19:00Z to 03-02T19:00Z.
 */
const AFTER = new Date('2020-03-10T07:00:00Z');
const DURING = new Date('2020-03-04T10:00:00Z'); // 15:00 on 2020-03-04
const at = (iso: string) => new Date(iso);

describe('Analytics (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let analytics: AnalyticsService;
  let vendorA: Awaited<ReturnType<typeof createLiveVendor>>;
  let vendorB: Awaited<ReturnType<typeof createLiveVendor>>;
  let o: Record<'o1' | 'o2' | 'o3' | 'o4' | 'o5', { id: string }>;

  const get = (path: string, auth = admin.auth) => http.get(`/api/v1${path}`).set(auth);

  async function mk(vendor: typeof vendorA, customerId: string, d: {
    placed: string;
    status: OrderStatus;
    delivered?: string;
    total: number;
    commission: number;
    fee?: number;
    discount?: number;
    method?: PaymentMethod;
  }) {
    const placed = at(d.placed);
    const hour = 3_600_000;
    return t.prisma.order.create({
      data: {
        orderNo: `A-${randomUUID().slice(0, 8)}`,
        customerId,
        vendorId: vendor.vendor.id,
        cityId: basics.cityId,
        addressSnapshot: {},
        status: d.status,
        pickupSlotStart: placed,
        pickupSlotEnd: new Date(placed.getTime() + hour),
        deliverySlotStart: placed,
        deliverySlotEnd: new Date(placed.getTime() + hour),
        subtotal: d.total,
        deliveryFee: d.fee ?? 0,
        discountTotal: d.discount ?? 0,
        total: d.total,
        commissionRatePct: 15,
        commissionAmount: d.commission,
        vendorEarning: d.total - d.commission,
        paymentMethod: d.method ?? PaymentMethod.COD,
        paymentStatus: 'COD_PENDING',
        vendorRespondBy: placed,
        createdAt: placed,
        placedAt: placed,
        deliveredAt: d.delivered ? at(d.delivered) : null,
      },
    });
  }
  const history = (orderId: string, toStatus: OrderStatus, when: string) =>
    t.prisma.orderStatusHistory.create({ data: { orderId, toStatus, createdAt: at(when) } });

  beforeAll(async () => {
    clock = fixedClock(AFTER);
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    analytics = t.app.get(AnalyticsService);
    vendorA = await createLiveVendor(t, basics, { name: 'Analytics A' });
    vendorB = await createLiveVendor(t, basics, { name: 'Analytics B' });
    const [c1, c2, c3] = await Promise.all([createCustomer(t), createCustomer(t), createCustomer(t)]);

    // 2020-03-02: o1 placed and delivered; o2 placed (delivered the next day); o4 placed and cancelled
    const o1 = await mk(vendorA, c1.user.id, { placed: '2020-03-02T06:00:00Z', status: 'DELIVERED', delivered: '2020-03-02T10:00:00Z', total: 1000, commission: 150, fee: 100 });
    const o2 = await mk(vendorA, c2.user.id, { placed: '2020-03-02T07:00:00Z', status: 'DELIVERED', delivered: '2020-03-03T09:00:00Z', total: 500, commission: 75, fee: 50, method: PaymentMethod.CARD });
    const o4 = await mk(vendorB, c3.user.id, { placed: '2020-03-02T08:00:00Z', status: 'CANCELLED', total: 700, commission: 105 });
    await history(o4.id, 'CANCELLED', '2020-03-02T09:00:00Z');
    // 2020-03-03: o3 placed at 00:30 Pakistan time (still 03-02 in UTC) and delivered
    const o3 = await mk(vendorB, c1.user.id, { placed: '2020-03-02T19:30:00Z', status: 'DELIVERED', delivered: '2020-03-03T12:00:00Z', total: 300, commission: 45, fee: 30, discount: 20 });
    // 2020-03-04: o5 placed and rejected
    const o5 = await mk(vendorA, c2.user.id, { placed: '2020-03-04T05:00:00Z', status: 'REJECTED', total: 400, commission: 60 });
    await history(o5.id, 'REJECTED', '2020-03-04T05:10:00Z');
    o = { o1, o2, o3, o4, o5 };

    // best sellers and ratings for vendor A
    await t.prisma.orderItem.createMany({
      data: [
        { orderId: o1.id, name: 'Shirt', serviceType: 'WASH_IRON', unitPrice: 100, qty: 10, lineTotal: 1000 },
        { orderId: o2.id, name: 'Shirt', serviceType: 'WASH_IRON', unitPrice: 100, qty: 5, lineTotal: 500 },
      ],
    });
    await t.prisma.review.createMany({
      data: [
        { orderId: o1.id, customerId: c1.user.id, targetType: 'VENDOR', vendorId: vendorA.vendor.id, rating: 5, createdAt: at('2020-03-03T08:00:00Z') },
        { orderId: o2.id, customerId: c2.user.id, targetType: 'VENDOR', vendorId: vendorA.vendor.id, rating: 4, createdAt: at('2020-03-03T09:00:00Z') },
      ],
    });
  });
  beforeEach(async () => {
    clock.set(AFTER);
    await clearRateLimits(t.redis);
  });
  afterAll(() => t.close());

  const RANGE = 'from=2020-03-02&to=2020-03-04';

  describe('overview', () => {
    it('matches sums taken straight from the orders table', async () => {
      const res = await get(`/admin/analytics/overview?${RANGE}`).expect(200);
      const start = at('2020-03-01T19:00:00Z');
      const end = at('2020-03-04T19:00:00Z');
      const delivered = await t.prisma.order.aggregate({
        where: { status: 'DELIVERED', deliveredAt: { gte: start, lt: end } },
        _sum: { total: true, commissionAmount: true, vendorEarning: true, deliveryFee: true, discountTotal: true },
        _count: { _all: true },
      });
      const placed = await t.prisma.order.count({ where: { createdAt: { gte: start, lt: end } } });
      const { totals } = res.body.data;
      expect(totals).toMatchObject({
        ordersPlaced: placed,
        ordersDelivered: delivered._count._all,
        gmv: new Prisma.Decimal(delivered._sum.total!).toFixed(2),
        revenue: new Prisma.Decimal(delivered._sum.commissionAmount!).toFixed(2),
        vendorEarnings: new Prisma.Decimal(delivered._sum.vendorEarning!).toFixed(2),
        deliveryFees: new Prisma.Decimal(delivered._sum.deliveryFee!).toFixed(2),
        discounts: new Prisma.Decimal(delivered._sum.discountTotal!).toFixed(2),
      });
      // and the hand-worked figures
      expect(totals).toMatchObject({
        ordersPlaced: 5,
        ordersDelivered: 3,
        ordersCancelled: 2,
        gmv: '1800.00',
        revenue: '270.00',
        vendorEarnings: '1530.00',
        deliveryFees: '180.00',
        discounts: '20.00',
        averageOrderValue: '600.00',
        activeCustomers: 3,
        newCustomers: 3,
      });
    });

    it('puts every figure on the Pakistan day it happened, one entry per day, and the days add up to the totals', async () => {
      const { series, totals } = (await get(`/admin/analytics/overview?${RANGE}`).expect(200)).body.data;
      expect(series.map((d: { day: string }) => d.day)).toEqual(['2020-03-02', '2020-03-03', '2020-03-04']);
      expect(series[0]).toMatchObject({ ordersPlaced: 3, ordersDelivered: 1, ordersCancelled: 1, gmv: '1000.00', revenue: '150.00' });
      // o3 was placed at 00:30 on the 3rd Pakistan time; o2 and o3 were delivered on the 3rd
      expect(series[1]).toMatchObject({ ordersPlaced: 1, ordersDelivered: 2, ordersCancelled: 0, gmv: '800.00', revenue: '120.00' });
      expect(series[2]).toMatchObject({ ordersPlaced: 1, ordersDelivered: 0, ordersCancelled: 1, gmv: '0.00' });
      const add = (k: string) => series.reduce((n: number, d: Record<string, string>) => n + Number(d[k]), 0);
      expect(add('gmv')).toBe(Number(totals.gmv));
      expect(add('revenue')).toBe(Number(totals.revenue));
      expect(add('ordersPlaced')).toBe(totals.ordersPlaced);
    });

    it('shows zero-filled days and zero totals when nothing happened', async () => {
      const { totals, series } = (await get('/admin/analytics/overview?from=2020-02-01&to=2020-02-03').expect(200)).body.data;
      expect(series).toHaveLength(3);
      expect(totals).toMatchObject({ ordersPlaced: 0, gmv: '0.00', averageOrderValue: '0.00', activeCustomers: 0 });
    });

    it('can be narrowed to a city', async () => {
      const mine = (await get(`/admin/analytics/overview?${RANGE}&cityId=${basics.cityId}`).expect(200)).body.data.totals;
      expect(mine.ordersPlaced).toBe(5);
      const other = (await get(`/admin/analytics/overview?${RANGE}&cityId=${basics.cityId + 9999}`).expect(200)).body.data.totals;
      expect(other).toMatchObject({ ordersPlaced: 0, gmv: '0.00' });
    });

    it('rejects impossible ranges and unknown values', async () => {
      for (const q of ['from=2020-03-05&to=2020-03-01', 'from=2026-02-30', 'from=2018-01-01&to=2020-12-31', 'from=yesterday', 'cityId=abc']) {
        const res = await get(`/admin/analytics/overview?${q}`).expect(400);
        expect(res.body.error.code).toMatch(/INVALID_RANGE|VALIDATION_FAILED/);
      }
    });
  });

  describe('orders, revenue and top vendors', () => {
    it('orders: counts by status, payment method and city', async () => {
      const d = (await get(`/admin/analytics/orders?${RANGE}`).expect(200)).body.data;
      expect(d.totals).toEqual({ ordersPlaced: 5, ordersDelivered: 3, ordersCancelled: 2 });
      expect(d.byStatus).toEqual(expect.arrayContaining([{ status: 'DELIVERED', orders: 3 }, { status: 'CANCELLED', orders: 1 }, { status: 'REJECTED', orders: 1 }]));
      expect(d.byPaymentMethod).toEqual(expect.arrayContaining([{ method: 'COD', orders: 4 }, { method: 'CARD', orders: 1 }]));
      expect(d.byCity).toEqual([expect.objectContaining({ cityId: basics.cityId, ordersPlaced: 5, ordersDelivered: 3, ordersCancelled: 2 })]);
    });

    it('revenue: splits sales into cash and prepaid and adds up per city', async () => {
      const d = (await get(`/admin/analytics/revenue?${RANGE}`).expect(200)).body.data;
      expect(d.totals).toMatchObject({ gmv: '1800.00', revenue: '270.00', cashGmv: '1300.00', prepaidGmv: '500.00' });
      expect(d.byCity).toEqual([expect.objectContaining({ gmv: '1800.00', revenue: '270.00' })]);
      expect(d.series).toHaveLength(3);
    });

    it('vendors: ranked by sales, vendors without a delivery left out, limit respected', async () => {
      const d = (await get(`/admin/analytics/vendors?${RANGE}`).expect(200)).body.data;
      expect(d.vendors.map((v: { businessName: string; gmv: string; rank: number }) => [v.rank, v.businessName, v.gmv])).toEqual([
        [1, 'Analytics A', '1500.00'],
        [2, 'Analytics B', '300.00'],
      ]);
      expect(d.vendors[0]).toMatchObject({ ordersDelivered: 2, revenue: '225.00', vendorEarnings: '1275.00' });
      const one = (await get(`/admin/analytics/vendors?${RANGE}&limit=1`).expect(200)).body.data;
      expect(one.vendors).toHaveLength(1);
      await get(`/admin/analytics/vendors?${RANGE}&limit=500`).expect(400);
    });
  });

  describe('daily rollup', () => {
    beforeEach(async () => {
      await t.prisma.dailyCityStat.deleteMany({});
      await t.prisma.dailyVendorStat.deleteMany({});
    });

    it('stores finished days on first use, once, and a repeat reads them back without recomputing', async () => {
      await get(`/admin/analytics/overview?${RANGE}`).expect(200);
      const rows = await t.prisma.dailyCityStat.findMany({ where: { cityId: basics.cityId }, orderBy: { day: 'asc' } });
      expect(rows.map((r) => r.day.toISOString().slice(0, 10))).toEqual(['2020-03-02', '2020-03-03', '2020-03-04']);
      expect(rows[1]).toMatchObject({ ordersPlaced: 1, ordersDelivered: 2 });
      const stamp = rows[0].computedAt.getTime();
      await get(`/admin/analytics/overview?${RANGE}`).expect(200);
      expect((await t.prisma.dailyCityStat.findFirstOrThrow({ where: { cityId: basics.cityId, day: rows[0].day } })).computedAt.getTime()).toBe(stamp);
    });

    it('serves from the stored rows once they exist (proof: edit a stored row and the dashboard follows it)', async () => {
      await get(`/admin/analytics/overview?${RANGE}`).expect(200);
      await t.prisma.dailyCityStat.updateMany({ where: { cityId: basics.cityId, day: new Date('2020-03-02T00:00:00Z') }, data: { ordersPlaced: 99 } });
      const d = (await get(`/admin/analytics/overview?${RANGE}`).expect(200)).body.data;
      expect(d.series[0].ordersPlaced).toBe(99);
    });

    it('recomputing a day is repeatable and fixes a stored row', async () => {
      await get(`/admin/analytics/overview?${RANGE}`).expect(200);
      await t.prisma.dailyCityStat.updateMany({ where: { cityId: basics.cityId, day: new Date('2020-03-02T00:00:00Z') }, data: { ordersPlaced: 99 } });
      await analytics.rollupDay('2020-03-02');
      await analytics.rollupDay('2020-03-02');
      const d = (await get(`/admin/analytics/overview?${RANGE}`).expect(200)).body.data;
      expect(d.series[0].ordersPlaced).toBe(3);
      expect(await t.prisma.dailyCityStat.count({ where: { cityId: basics.cityId, day: new Date('2020-03-02T00:00:00Z') } })).toBe(1);
    });

    it('today is computed live and never stored', async () => {
      clock.set(DURING); // 2020-03-04 is "today"
      const d = (await get('/admin/analytics/overview?from=2020-03-04&to=2020-03-04').expect(200)).body.data;
      expect(d.series[0]).toMatchObject({ day: '2020-03-04', ordersPlaced: 1, ordersCancelled: 1 });
      expect(await t.prisma.dailyCityStat.count({ where: { day: new Date('2020-03-04T00:00:00Z') } })).toBe(0);
      // a new order today shows up at once
      const c = await createCustomer(t);
      await mkToday(c.user.id);
      const again = (await get('/admin/analytics/overview?from=2020-03-04&to=2020-03-04').expect(200)).body.data;
      expect(again.series[0].ordersPlaced).toBe(2);
      await t.prisma.order.delete({ where: { id: (await t.prisma.order.findFirstOrThrow({ where: { customerId: c.user.id } })).id } });
    });

    async function mkToday(customerId: string) {
      return mk(vendorB, customerId, { placed: '2020-03-04T06:00:00Z', status: 'PLACED', total: 100, commission: 15 });
    }

    it('the nightly job rolls up yesterday by default, and a list of days when asked', async () => {
      const processor = new AnalyticsProcessor(analytics);
      clock.set(new Date('2020-03-03T20:30:00Z')); // 01:30 on 2020-03-04 Pakistan time -> yesterday is the 3rd
      const done = await processor.process({ name: 'rollup-daily', data: {} } as Job);
      expect(done.days).toEqual(['2020-03-03']);
      expect(await t.prisma.dailyCityStat.count({ where: { day: new Date('2020-03-03T00:00:00Z') } })).toBeGreaterThan(0);
      expect((await processor.process({ name: 'rollup-daily', data: { days: ['2020-03-02'] } } as Job)).days).toEqual(['2020-03-02']);
      await expect(processor.process({ name: 'something-else', data: {} } as Job)).rejects.toThrow(/No handler/);
    });

    it('POST /admin/analytics/rollup queues finished days only and refuses bad input', async () => {
      const queue = t.app.get<Queue>(getQueueToken(QUEUES.ANALYTICS));
      await queue.obliterate({ force: true });
      clock.set(DURING);
      const res = await http.post('/api/v1/admin/analytics/rollup').set(admin.auth).send({ from: '2020-03-02', to: '2020-03-04' }).expect(202);
      expect(res.body.data.queued).toEqual(['2020-03-02', '2020-03-03']); // the 4th is today
      const jobs = await queue.getJobs(['waiting', 'delayed']);
      expect(jobs.map((j) => j.data)).toEqual([{ days: ['2020-03-02', '2020-03-03'] }]);
      await http.post('/api/v1/admin/analytics/rollup').set(admin.auth).send({ from: '2020-03-05', to: '2020-03-01' }).expect(400);
      await queue.obliterate({ force: true });
    });
  });

  describe('vendor analytics', () => {
    beforeEach(() => clock.set(DURING));

    it('counts only the shop’s own orders, matching the orders table', async () => {
      const res = await get('/vendor/analytics?days=7', vendorA.owner.auth).expect(200);
      const d = res.body.data;
      expect(d.range).toEqual({ from: '2020-02-27', to: '2020-03-04', days: 7 });
      expect(d.series).toHaveLength(7);
      expect(d.totals).toMatchObject({
        ordersPlaced: 3,
        ordersDelivered: 2,
        ordersRejected: 1,
        ordersCancelled: 0,
        sales: '1500.00',
        commission: '225.00',
        earnings: '1275.00',
        averageOrderValue: '750.00',
        acceptanceRate: 66.7,
      });
      const own = await t.prisma.order.aggregate({ where: { vendorId: vendorA.vendor.id, status: 'DELIVERED' }, _sum: { vendorEarning: true } });
      expect(d.totals.earnings).toBe(new Prisma.Decimal(own._sum.vendorEarning!).toFixed(2));
      expect(d.today).toMatchObject({ ordersPlaced: 1, ordersRejected: 1, ordersDelivered: 0, sales: '0.00' });
      expect(d.series.find((x: { day: string }) => x.day === '2020-03-02')).toMatchObject({ ordersPlaced: 2, ordersDelivered: 1, sales: '1000.00', earnings: '850.00' });
    });

    it('the other shop sees its own figures, never vendor A’s', async () => {
      const d = (await get('/vendor/analytics?days=7', vendorB.owner.auth).expect(200)).body.data;
      expect(d.totals).toMatchObject({ ordersPlaced: 2, ordersDelivered: 1, ordersCancelled: 1, ordersRejected: 0, sales: '300.00', earnings: '255.00' });
    });

    it('lists best-selling services and the weekly rating trend', async () => {
      const d = (await get('/vendor/analytics?days=30', vendorA.owner.auth).expect(200)).body.data;
      expect(d.topServices).toEqual([{ name: 'Shirt', quantity: 15, revenue: '1500.00' }]);
      expect(d.ratingTrend).toEqual([{ weekStarting: '2020-03-02', average: '4.50', reviews: 2 }]);
    });

    it('shows what is in progress right now', async () => {
      const c = await createCustomer(t);
      const open = await mk(vendorA, c.user.id, { placed: '2020-03-04T06:00:00Z', status: 'IN_PROCESS', total: 100, commission: 15 });
      const d = (await get('/vendor/analytics', vendorA.owner.auth).expect(200)).body.data;
      expect(d.inProgress).toEqual([{ status: 'IN_PROCESS', orders: 1 }]);
      await t.prisma.order.delete({ where: { id: open.id } });
    });

    it('accepts only 7, 30 or 90 days', async () => {
      for (const days of ['14', '0', 'x']) await get(`/vendor/analytics?days=${days}`, vendorA.owner.auth).expect(400);
    });
  });

  describe('access', () => {
    it('is closed to everyone but admins (and vendor analytics to vendors)', async () => {
      const customer = await createCustomer(t);
      for (const path of ['overview', 'orders', 'revenue', 'vendors']) {
        await http.get(`/api/v1/admin/analytics/${path}`).expect(401);
        await get(`/admin/analytics/${path}`, customer.auth).expect(403);
        await get(`/admin/analytics/${path}`, vendorA.owner.auth).expect(403);
      }
      await http.post('/api/v1/admin/analytics/rollup').set(customer.auth).send({}).expect(403);
      await get('/vendor/analytics', customer.auth).expect(403);
      await get('/vendor/analytics', admin.auth).expect(403);
      await http.get('/api/v1/vendor/analytics').expect(401);
    });
  });
});
