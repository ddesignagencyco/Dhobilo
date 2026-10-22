import { JobType } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { MockCourierProvider, mockWebhookSignature } from '../src/modules/delivery/courier/mock-courier.provider';
import { DispatchService } from '../src/modules/delivery/dispatch.service';
import { OpsAlertService } from '../src/modules/delivery/ops-alert.service';
import { riderGeoKey } from '../src/modules/delivery/rider-presence.service';
import { acceptedOrder, createRider, jobOf } from './delivery-helpers';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createCustomer, createTestApp, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, orderScenario, placeOrder } from './order-helpers';

const SECRET = 'test-courier-secret';
const SEARCH_OPEN = new Date('2026-10-24T04:30:00Z');

describe('Courier partners (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let partnerId: string;
  let dispatch: DispatchService;
  let alert: jest.SpyInstance;
  let cancelAtPartner: jest.SpyInstance;
  let eventSeq = 0;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    dispatch = t.app.get(DispatchService);
    alert = jest.spyOn(t.app.get(OpsAlertService), 'alert').mockResolvedValue(undefined);
    cancelAtPartner = jest.spyOn(t.app.get(MockCourierProvider), 'cancelJob');
    // The migration seeds this row in real databases; the test database is emptied first.
    partnerId = (await t.prisma.courierPartner.upsert({ where: { code: 'mock' }, update: {}, create: { code: 'mock', name: 'Mock courier (testing)', isActive: false } })).id;
  });
  beforeEach(async () => {
    clock.set(NOW);
    alert.mockClear();
    cancelAtPartner.mockClear();
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
    await t.prisma.courierPartner.update({ where: { id: partnerId }, data: { isActive: false } });
    await t.prisma.city.update({ where: { id: basics.cityId }, data: { courierPartnerId: null } });
    await t.prisma.rider.updateMany({ data: { isOnline: false } });
    await t.redis.del(riderGeoKey(basics.cityId));
    await t.prisma.deliveryJob.updateMany({ where: { status: { in: ['UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'IN_TRANSIT', 'FAILED'] } }, data: { status: 'CANCELLED' } });
  });
  afterAll(async () => {
    await t.prisma.city.update({ where: { id: basics.cityId }, data: { courierPartnerId: null } });
    await t.close();
  });

  const useCourier = async () => {
    await http.patch(`/api/v1/admin/courier-partners/${partnerId}`).set(admin.auth).send({ isActive: true }).expect(200);
    await http.patch(`/api/v1/admin/cities/${basics.cityId}`).set(admin.auth).send({ courierPartnerId: partnerId }).expect(200);
  };
  const reload = (id: string) => t.prisma.deliveryJob.findUniqueOrThrow({ where: { id } });
  const statusOf = async (orderId: string) => (await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;

  /** An accepted order whose pickup job the partner has taken. */
  async function partnerPickup() {
    await useCourier();
    const s = await orderScenario(t, basics);
    const order = await acceptedOrder(http, t, s, () => placeOrder(http, s));
    const job = await jobOf(t, order.id, JobType.PICKUP);
    clock.set(SEARCH_OPEN);
    expect(await dispatch.dispatch(job.id)).toBe('partner');
    return { s, order, job: await reload(job.id) };
  }

  const event = (trackingRef: string, status: string, extra: Record<string, unknown> = {}) => ({ eventId: `evt-${++eventSeq}-${Date.now()}`, trackingRef, status, ...extra });
  const send = (body: { eventId: string; trackingRef: string; status: string }, signature = mockWebhookSignature(SECRET, body), code = 'mock') =>
    http.post(`/api/v1/webhooks/courier/${code}`).set('x-courier-signature', signature).send(body);

  describe('admin controls', () => {
    it('lists partners, turns one on and off (audited), and assigns it to a city', async () => {
      const list = await http.get('/api/v1/admin/courier-partners').set(admin.auth).expect(200);
      expect(list.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: partnerId, code: 'mock', isActive: false, cities: [] })]));

      await http.patch(`/api/v1/admin/courier-partners/${partnerId}`).set(admin.auth).send({ isActive: true }).expect(200);
      expect(await t.prisma.auditLog.count({ where: { action: 'COURIER_PARTNER_TOGGLED', entityId: partnerId } })).toBeGreaterThanOrEqual(1);

      const city = await http.patch(`/api/v1/admin/cities/${basics.cityId}`).set(admin.auth).send({ courierPartnerId: partnerId }).expect(200);
      expect(city.body.data.courierPartnerId).toBe(partnerId);
      const after = await http.get('/api/v1/admin/courier-partners').set(admin.auth).expect(200);
      expect(after.body.data.find((p: { id: string }) => p.id === partnerId).cities).toEqual([{ id: basics.cityId, name: expect.any(String) }]);

      const cleared = await http.patch(`/api/v1/admin/cities/${basics.cityId}`).set(admin.auth).send({ courierPartnerId: null }).expect(200);
      expect(cleared.body.data.courierPartnerId).toBeNull();
    });

    it('rejects unknown partners and non-admins', async () => {
      const bad = await http.patch(`/api/v1/admin/cities/${basics.cityId}`).set(admin.auth).send({ courierPartnerId: '00000000-0000-4000-8000-000000000000' }).expect(400);
      expect(bad.body.error.code).toBe('COURIER_PARTNER_NOT_FOUND');
      await http.patch(`/api/v1/admin/cities/${basics.cityId}`).set(admin.auth).send({ courierPartnerId: 'nope' }).expect(400);
      await http.patch('/api/v1/admin/courier-partners/00000000-0000-4000-8000-000000000000').set(admin.auth).send({ isActive: true }).expect(404);
      await http.patch(`/api/v1/admin/courier-partners/${partnerId}`).set(admin.auth).send({ isActive: 'yes' }).expect(400);

      const customer = await createCustomer(t);
      await http.get('/api/v1/admin/courier-partners').set(customer.auth).expect(403);
      await http.patch(`/api/v1/admin/courier-partners/${partnerId}`).set(customer.auth).send({ isActive: true }).expect(403);
    });
  });

  describe('dispatch in a partner city', () => {
    it('hands the job to the partner instead of offering it to riders', async () => {
      const r = await createRider(t, basics);
      const { job } = await partnerPickup();
      expect(job).toMatchObject({ status: 'ACCEPTED', riderId: null, partnerId });
      expect(job.partnerRef).toMatch(/^MOCK-/);
      expect(await t.prisma.notification.count({ where: { userId: r.user.id, template: 'rider_job_offer' } })).toBe(0);
      expect(await dispatch.dispatch(job.id)).toBe('skipped');
    });

    it('riders cannot claim a partner’s job, and the customer sees the courier, not a rider', async () => {
      const r = await createRider(t, basics);
      const { s, order, job } = await partnerPickup();
      await http.post(`/api/v1/rider/jobs/${job.id}/claim`).set(r.auth).send({}).expect(404);
      const legs = await http.get(`/api/v1/orders/${order.id}/delivery`).set(s.customer.auth).expect(200);
      expect(legs.body.data[0]).toMatchObject({ jobType: 'PICKUP', status: 'ACCEPTED', handledBy: 'COURIER_PARTNER', rider: null });
    });

    it('an inactive partner is ignored: the city’s own riders get the job', async () => {
      await http.patch(`/api/v1/admin/cities/${basics.cityId}`).set(admin.auth).send({ courierPartnerId: partnerId }).expect(200); // assigned but switched off
      const r = await createRider(t, basics);
      const s = await orderScenario(t, basics);
      const order = await acceptedOrder(http, t, s, () => placeOrder(http, s));
      const job = await jobOf(t, order.id, JobType.PICKUP);
      clock.set(SEARCH_OPEN);
      expect(await dispatch.dispatch(job.id)).toBe('offered');
      expect((await reload(job.id)).riderId).toBe(r.rider.id);
    });

    it('cancelling the order cancels the partner’s job and tells the partner', async () => {
      const { s, order, job } = await partnerPickup();
      await http.post(`/api/v1/orders/${order.id}/cancel`).set(s.customer.auth).send({ reason: 'Changed my mind' }).expect(200);
      expect((await reload(job.id)).status).toBe('CANCELLED');
      await new Promise((resolve) => setTimeout(resolve, 100)); // the partner call is made after the event
      expect(cancelAtPartner).toHaveBeenCalledWith(job.partnerRef);
    });
  });

  describe('webhooks', () => {
    it('applies the partner’s progress: set out, then delivered the clothes to the shop (order PICKED_UP)', async () => {
      const { order, job } = await partnerPickup();
      const res = await send(event(job.partnerRef!, 'IN_TRANSIT')).expect(200);
      expect(res.body.data).toEqual({ duplicate: false });
      expect(await reload(job.id)).toMatchObject({ status: 'IN_TRANSIT' });
      expect(await statusOf(order.id)).toBe('ACCEPTED');

      await send(event(job.partnerRef!, 'COMPLETED')).expect(200);
      expect(await reload(job.id)).toMatchObject({ status: 'COMPLETED' });
      expect(await statusOf(order.id)).toBe('PICKED_UP');
      const h = await t.prisma.orderStatusHistory.findFirstOrThrow({ where: { orderId: order.id, toStatus: 'PICKED_UP' } });
      expect(h).toMatchObject({ actorRole: 'RIDER', actorId: null });
    });

    it('a delivery by the partner takes the order out for delivery and then delivers it', async () => {
      const { s, order, job: pickup } = await partnerPickup();
      await send(event(pickup.partnerRef!, 'COMPLETED')).expect(200); // straight to done: set-out is implied
      for (const status of ['IN_PROCESS', 'READY']) await http.post(`/api/v1/vendor/orders/${order.id}/status`).set(s.vendor.owner.auth).send({ status }).expect(200);

      const drop = await jobOf(t, order.id, JobType.DROP);
      clock.set(new Date('2026-10-26T05:00:00Z')); // an hour before the delivery window
      expect(await dispatch.dispatch(drop.id)).toBe('partner');
      const taken = await reload(drop.id);

      await send(event(taken.partnerRef!, 'IN_TRANSIT')).expect(200);
      expect(await statusOf(order.id)).toBe('OUT_FOR_DELIVERY');
      await send(event(taken.partnerRef!, 'COMPLETED')).expect(200);
      expect(await statusOf(order.id)).toBe('DELIVERED');
      expect(await reload(drop.id)).toMatchObject({ status: 'COMPLETED', proofType: null });
    });

    it('a repeated event id changes nothing, even with a different payload, and even when sent in parallel', async () => {
      const { order, job } = await partnerPickup();
      const first = event(job.partnerRef!, 'IN_TRANSIT');
      const burst = await Promise.all(Array.from({ length: 6 }, () => send(first)));
      expect(burst.map((r) => r.status)).toEqual(Array(6).fill(200));
      expect(burst.filter((r) => r.body.data.duplicate === false)).toHaveLength(1);
      expect(burst.filter((r) => r.body.data.duplicate === true)).toHaveLength(5);

      const replay = { ...first, status: 'COMPLETED' }; // same id, different claim: still just a duplicate
      expect((await send(replay).expect(200)).body.data).toEqual({ duplicate: true });
      expect(await reload(job.id)).toMatchObject({ status: 'IN_TRANSIT' });
      expect(await statusOf(order.id)).toBe('ACCEPTED');
      expect(await t.prisma.courierWebhookEvent.count({ where: { eventId: first.eventId } })).toBe(1);
    });

    it('an event that cannot be applied is refused and not remembered, so the partner’s retry can succeed later', async () => {
      const { job } = await partnerPickup();
      const early = event(job.partnerRef!, 'COMPLETED');
      await send(event(job.partnerRef!, 'IN_TRANSIT')).expect(200);
      await send(early).expect(200); // fine: completes
      const again = event(job.partnerRef!, 'COMPLETED');
      const refused = await send(again).expect(409);
      expect(refused.body.error.code).toBe('JOB_INVALID_TRANSITION');
      expect(await t.prisma.courierWebhookEvent.count({ where: { eventId: again.eventId } })).toBe(0);
    });

    it('a failure from the partner marks the job failed and alerts ops', async () => {
      const { job } = await partnerPickup();
      await send(event(job.partnerRef!, 'FAILED', { reason: 'Nobody home' })).expect(200);
      expect(await reload(job.id)).toMatchObject({ status: 'FAILED', failureReason: 'Nobody home' });
      expect(alert).toHaveBeenCalledWith('A courier partner job failed', expect.stringContaining('Nobody home'), expect.anything());
    });

    it('refuses forged, unsigned, malformed and misdirected calls without changing anything', async () => {
      const { job } = await partnerPickup();
      const body = event(job.partnerRef!, 'COMPLETED');

      expect((await send(body, 'f'.repeat(64)).expect(401)).body.error.code).toBe('UNAUTHENTICATED');
      expect((await send(body, mockWebhookSignature('some-other-secret', body)).expect(401)).body.error.code).toBe('UNAUTHENTICATED');
      await http.post('/api/v1/webhooks/courier/mock').send(body).expect(401); // no signature
      await http.post('/api/v1/webhooks/courier/mock').set('x-courier-signature', 'x').send({ nonsense: true }).expect(401);
      await send(body, mockWebhookSignature(SECRET, { ...body, status: 'IN_TRANSIT' })).expect(401); // signature for a different status
      await send(body, undefined, 'unknown-courier').expect(404);

      const ghost = event('MOCK-NOSUCHJOB', 'COMPLETED');
      await send(ghost).expect(404);
      expect(await t.prisma.courierWebhookEvent.count({ where: { eventId: ghost.eventId } })).toBe(0);

      expect(await reload(job.id)).toMatchObject({ status: 'ACCEPTED' });
      expect(await t.prisma.courierWebhookEvent.count({ where: { eventId: body.eventId } })).toBe(0);
    });
  });
});
