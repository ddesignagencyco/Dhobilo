import { JobStatus, JobType, OrderStatus } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { Basics, NOW, TestApp, clearRateLimits, createTestApp, fixedClock, prepareReferenceData } from './helpers';
import { createRider } from './delivery-helpers';
import { OrderScenario, orderScenario, placeOrder } from './order-helpers';

describe('Reviews (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
  });
  afterAll(() => t.close());

  async function deliveredOrder(): Promise<OrderScenario & { order: { id: string; orderNo: string; status: string } }> {
    const s = await orderScenario(t, basics);
    const order = await placeOrder(http, s);
    await t.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.DELIVERED, deliveredAt: clock.now() } });
    return { ...s, order };
  }

  function review(s: OrderScenario, orderId: string, body: Record<string, unknown>) {
    return http.post(`/api/v1/orders/${orderId}/reviews`).set(s.customer.auth).send(body);
  }

  it('rates the vendor, updates the aggregate and exposes the review publicly', async () => {
    const s = await deliveredOrder();

    const created = await review(s, s.order.id, { vendor: { rating: 5, comment: '  Crisp and on time  ' } }).expect(201);
    expect(created.body.data).toEqual([
      expect.objectContaining({
        orderId: s.order.id,
        targetType: 'VENDOR',
        rating: 5,
        comment: 'Crisp and on time',
        vendor: { id: s.vendor.vendor.id, businessName: s.vendor.vendor.businessName },
        riderId: null,
      }),
    ]);

    const vendor = await t.prisma.vendor.findUniqueOrThrow({ where: { id: s.vendor.vendor.id } });
    expect(Number(vendor.ratingAvg)).toBe(5);
    expect(vendor.ratingCount).toBe(1);

    const publicList = await http.get(`/api/v1/vendors/${s.vendor.vendor.id}/reviews`).expect(200);
    expect(publicList.body.data).toEqual([
      expect.objectContaining({ rating: 5, comment: 'Crisp and on time', customerName: 'Customer' }),
    ]);
    expect(publicList.body.meta).toMatchObject({
      summary: { vendorName: s.vendor.vendor.businessName, ratingAvg: '5.00', ratingCount: 1, distribution: { '5': 1 } },
    });
  });

  it('allows one review per target per order and hides other customers’ orders', async () => {
    const s = await deliveredOrder();
    await review(s, s.order.id, { vendor: { rating: 4 } }).expect(201);

    const duplicate = await review(s, s.order.id, { vendor: { rating: 2 } }).expect(409);
    expect(duplicate.body.error.code).toBe('REVIEW_EXISTS');

    const other = await deliveredOrder();
    const stranger = await orderScenario(t, basics);
    const notMine = await review(stranger, other.order.id, { vendor: { rating: 5 } }).expect(404);
    expect(notMine.body.error.code).toBe('ORDER_NOT_FOUND');
  });

  it('rejects reviews before delivery, without a target and without a rider', async () => {
    const s = await orderScenario(t, basics);
    const placed = await placeOrder(http, s);

    const early = await review(s, placed.id, { vendor: { rating: 5 } }).expect(409);
    expect(early.body.error.code).toBe('ORDER_NOT_DELIVERED');

    await t.prisma.order.update({ where: { id: placed.id }, data: { status: OrderStatus.DELIVERED, deliveredAt: clock.now() } });
    const empty = await review(s, placed.id, {}).expect(400);
    expect(empty.body.error.code).toBe('REVIEW_TARGET_REQUIRED');

    const noRider = await review(s, placed.id, { vendor: { rating: 5 }, rider: { rating: 5 } }).expect(422);
    expect(noRider.body.error.code).toBe('RIDER_REVIEW_UNAVAILABLE');
  });

  it('rates the rider only after an original completed drop by that rider', async () => {
    const s = await deliveredOrder();
    const rider = await createRider(t, basics, { online: false });
    await t.prisma.deliveryJob.create({
      data: {
        orderId: s.order.id,
        jobType: JobType.DROP,
        attempt: 1,
        status: JobStatus.COMPLETED,
        riderId: rider.rider.id,
        scheduledStart: clock.now(),
        scheduledEnd: new Date(clock.now().getTime() + 60 * 60_000),
        completedAt: clock.now(),
      },
    });

    const created = await review(s, s.order.id, { rider: { rating: 3, comment: 'Polite but late' } }).expect(201);
    expect(created.body.data).toEqual([
      expect.objectContaining({ targetType: 'RIDER', rating: 3, riderId: rider.rider.id, vendor: null }),
    ]);

    const row = await t.prisma.rider.findUniqueOrThrow({ where: { id: rider.rider.id } });
    expect(Number(row.ratingAvg)).toBe(3);
    expect(row.ratingCount).toBe(1);
  });
});
