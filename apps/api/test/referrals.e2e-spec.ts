import { randomUUID } from 'node:crypto';
import { OrderStatus } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { ReferralsService } from '../src/modules/promos/referrals.service';
import {
  Basics,
  NOW,
  TestApp,
  clearRateLimits,
  createTestApp,
  fixedClock,
  insertOrder,
  prepareReferenceData,
  randomPhone,
} from './helpers';
import { orderScenario } from './order-helpers';

describe('Referrals (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let referrals: ReferralsService;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    referrals = t.app.get(ReferralsService);
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
  });
  afterAll(() => t.close());

  async function signupWithReferral(code: string) {
    const phone = randomPhone();
    await http.post('/api/v1/auth/otp/request').send({ phone }).expect(200);
    const res = await http
      .post('/api/v1/auth/otp/verify')
      .set('x-token-transport', 'body')
      .send({ phone, code: '123456', role: 'CUSTOMER', referralCode: code })
      .expect(200);
    return { phone, ...res.body.data };
  }

  it('links a new customer to the referrer and rewards the first delivered order', async () => {
    const referrer = await orderScenario(t, basics);
    const referee = await signupWithReferral(referrer.customer.user.referralCode!);
    expect(referee.isNewUser).toBe(true);

    const referral = await t.prisma.referral.findUniqueOrThrow({ where: { refereeId: referee.user.id } });
    expect(referral).toMatchObject({ referrerId: referrer.customer.user.id, status: 'PENDING' });

    const order = await insertOrder(t, {
      vendorId: referrer.vendor.vendor.id,
      customerId: referee.user.id,
      cityId: basics.cityId,
      pickupSlotStart: new Date('2026-10-24T05:00:00Z'),
      deliverySlotStart: new Date('2026-10-26T06:00:00Z'),
      status: OrderStatus.DELIVERED,
    });
    await referrals.onOrderChanged({
      orderId: order.id,
      from: OrderStatus.OUT_FOR_DELIVERY,
      to: OrderStatus.DELIVERED,
      seq: 1,
      actor: 'SYSTEM',
      at: clock.now().toISOString(),
    });

    const overview = await http.get('/api/v1/me/referral').set(referrer.customer.auth).expect(200);
    expect(overview.body.data).toMatchObject({
      code: referrer.customer.user.referralCode,
      rewardAmount: '100.00',
      pending: 0,
      rewarded: 1,
    });
    expect(overview.body.data.referrals[0]).toMatchObject({ status: 'REWARDED', rewardCode: expect.any(String) });

    const rewardCode = overview.body.data.referrals[0].rewardCode as string;
    const promo = await t.prisma.promoCode.findUniqueOrThrow({ where: { code: rewardCode } });
    expect(promo).toMatchObject({ ownerUserId: referrer.customer.user.id, maxUses: 1, perUserLimit: 1, isActive: true });
    expect(promo.value.toFixed(2)).toBe('100.00');

    const placed = await http
      .post('/api/v1/orders')
      .set(referrer.customer.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        vendorId: referrer.vendor.vendor.id,
        addressId: referrer.address.id,
        items: [{ serviceItemId: referrer.item.id, qty: 2 }],
        pickupSlotStart: '2026-10-24T05:00:00.000Z',
        deliverySlotStart: '2026-10-26T06:00:00.000Z',
        paymentMethod: 'COD',
        expectedTotal: '250.00',
        promoCode: rewardCode,
      })
      .expect(201);
    expect(placed.body.data).toMatchObject({ discountTotal: '100.00', total: '250.00', promo: { code: rewardCode } });
  });

  it('rejects an unknown referral code at signup', async () => {
    const phone = randomPhone();
    await http.post('/api/v1/auth/otp/request').send({ phone }).expect(200);
    const res = await http
      .post('/api/v1/auth/otp/verify')
      .set('x-token-transport', 'body')
      .send({ phone, code: '123456', role: 'CUSTOMER', referralCode: 'NOPE1234' })
      .expect(422);
    expect(res.body.error.code).toBe('INVALID_REFERRAL');
    expect(await t.prisma.user.findUnique({ where: { phone } })).toBeNull();
  });

  it('does not reward a second delivered order', async () => {
    const referrer = await orderScenario(t, basics);
    const referee = await signupWithReferral(referrer.customer.user.referralCode!);
    const makeOrder = () =>
      insertOrder(t, {
        vendorId: referrer.vendor.vendor.id,
        customerId: referee.user.id,
        cityId: basics.cityId,
        pickupSlotStart: new Date('2026-10-24T05:00:00Z'),
        deliverySlotStart: new Date('2026-10-26T06:00:00Z'),
        status: OrderStatus.DELIVERED,
      });
    const first = await makeOrder();
    await referrals.onOrderChanged({
      orderId: first.id,
      from: OrderStatus.OUT_FOR_DELIVERY,
      to: OrderStatus.DELIVERED,
      seq: 1,
      actor: 'SYSTEM',
      at: clock.now().toISOString(),
    });

    const second = await makeOrder();
    await referrals.onOrderChanged({
      orderId: second.id,
      from: OrderStatus.OUT_FOR_DELIVERY,
      to: OrderStatus.DELIVERED,
      seq: 2,
      actor: 'SYSTEM',
      at: clock.now().toISOString(),
    });

    expect(await t.prisma.referral.count({ where: { referrerId: referrer.customer.user.id, status: 'REWARDED' } })).toBe(1);
    expect(await t.prisma.promoCode.count({ where: { ownerUserId: referrer.customer.user.id } })).toBe(1);
  });
});
