import { JobType } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { CloudinaryService, uploadFolder } from '../src/infra/cloudinary/cloudinary.service';
import { OpsAlertService } from '../src/modules/delivery/ops-alert.service';
import { riderGeoKey } from '../src/modules/delivery/rider-presence.service';
import { NotificationOrchestrator } from '../src/modules/notifications/notification-orchestrator';
import { TestRider, acceptedOrder, createRider, jobOf } from './delivery-helpers';
import { Basics, NOW, TestApp, clearRateLimits, createCustomer, createTestApp, fakeCloudinary, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, orderScenario, placeOrder } from './order-helpers';

describe('Rider job flow, proof of delivery and earnings (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let alert: jest.SpyInstance;
  let notify: jest.SpyInstance;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock).overrideProvider(CloudinaryService).useValue(fakeCloudinary()) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    alert = jest.spyOn(t.app.get(OpsAlertService), 'alert').mockResolvedValue(undefined);
    notify = jest.spyOn(t.app.get(NotificationOrchestrator), 'notifyUser');
  });
  beforeEach(async () => {
    clock.set(NOW);
    alert.mockClear();
    notify.mockClear();
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
    await t.prisma.rider.updateMany({ data: { isOnline: false } });
    await t.redis.del(riderGeoKey(basics.cityId));
  });
  afterAll(() => t.close());

  const rider = (r: { auth: Record<string, string> }, method: 'post' | 'get', path: string, body: object = {}) => http[method](`/api/v1/rider${path}`).set(r.auth).send(method === 'post' ? body : undefined);
  const statusOf = async (orderId: string) => (await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;
  const reload = (id: string) => t.prisma.deliveryJob.findUniqueOrThrow({ where: { id } });
  const vendorStep = (s: OrderScenario, orderId: string, status: string) => http.post(`/api/v1/vendor/orders/${orderId}/status`).set(s.vendor.owner.auth).send({ status }).expect(200);
  /** The delivery code the customer was sent (captured as it is sent: only a hash is stored). */
  const lastCode = () => {
    const call = [...notify.mock.calls].reverse().find((c) => c[1] === 'delivery_code');
    return call?.[2].code as string;
  };
  const proofPhotoFor = (r: TestRider) => `${uploadFolder('test', 'proof', r.user.id)}/doorstep`;

  /** Order with its pickup done by `r`; the vendor then washes it, so the delivery job exists and is unassigned. */
  async function readyForDelivery(r: TestRider, s?: OrderScenario) {
    const sc = s ?? (await orderScenario(t, basics));
    const order = await acceptedOrder(http, t, sc, () => placeOrder(http, sc));
    const pickup = await jobOf(t, order.id, JobType.PICKUP);
    await rider(r, 'post', `/jobs/${pickup.id}/claim`).expect(200);
    await rider(r, 'post', `/jobs/${pickup.id}/start`).expect(200);
    await rider(r, 'post', `/jobs/${pickup.id}/complete`).expect(200);
    await vendorStep(sc, order.id, 'IN_PROCESS');
    await vendorStep(sc, order.id, 'READY');
    return { s: sc, order, pickup, drop: await jobOf(t, order.id, JobType.DROP) };
  }
  /** ...and the rider has set out with it, so the customer holds a code. */
  async function outForDelivery(r: TestRider) {
    const f = await readyForDelivery(r);
    await rider(r, 'post', `/jobs/${f.drop.id}/claim`).expect(200);
    await rider(r, 'post', `/jobs/${f.drop.id}/start`).expect(200);
    return f;
  }

  describe('pickup leg', () => {
    it('claim -> start -> complete moves the order to PICKED_UP, recording the rider as the actor', async () => {
      const r = await createRider(t, basics);
      const sc = await orderScenario(t, basics);
      const order = await acceptedOrder(http, t, sc, () => placeOrder(http, sc));
      const job = await jobOf(t, order.id, JobType.PICKUP);

      await rider(r, 'post', `/jobs/${job.id}/complete`).expect(404); // not theirs yet
      await rider(r, 'post', `/jobs/${job.id}/claim`).expect(200);
      expect((await rider(r, 'post', `/jobs/${job.id}/complete`).expect(409)).body.error.code).toBe('JOB_INVALID_TRANSITION'); // not started

      const started = await rider(r, 'post', `/jobs/${job.id}/start`).expect(200);
      expect(Object.keys(started.body.data)).not.toEqual(expect.arrayContaining(['proofOtpHash']));
      for (const hidden of ['proofOtpHash', 'declinedRiderIds', 'dispatchAttempts', 'partnerId']) expect(started.body.data).not.toHaveProperty(hidden);
      expect(started.body.data).toMatchObject({ status: 'IN_TRANSIT', nextActions: expect.arrayContaining(['COMPLETED', 'FAILED']) });
      expect(await statusOf(order.id)).toBe('ACCEPTED'); // still waiting for the clothes
      await rider(r, 'post', `/jobs/${job.id}/start`).expect(409);

      const done = await rider(r, 'post', `/jobs/${job.id}/complete`).expect(200);
      expect(done.body.data).toMatchObject({ status: 'COMPLETED' });
      expect(await statusOf(order.id)).toBe('PICKED_UP');
      expect((await reload(job.id)).completedAt).not.toBeNull();

      const history = await t.prisma.orderStatusHistory.findFirstOrThrow({ where: { orderId: order.id, toStatus: 'PICKED_UP' } });
      expect(history).toMatchObject({ actorId: r.user.id, actorRole: 'RIDER' });
      await rider(r, 'post', `/jobs/${job.id}/complete`).expect(409); // twice
    });

    it('a delivery code means nothing for a pickup, and other riders can’t touch someone else’s job', async () => {
      const r = await createRider(t, basics);
      const other = await createRider(t, basics, { lat: 31.6 });
      const sc = await orderScenario(t, basics);
      const order = await acceptedOrder(http, t, sc, () => placeOrder(http, sc));
      const job = await jobOf(t, order.id, JobType.PICKUP);
      await rider(r, 'post', `/jobs/${job.id}/claim`).expect(200);
      await rider(r, 'post', `/jobs/${job.id}/start`).expect(200);

      const bodies: Record<string, object> = { release: { reason: 'nope' }, fail: { reason: 'nope' } };
      for (const action of ['start', 'complete', 'fail', 'release', 'accept', 'decline']) {
        await rider(other, 'post', `/jobs/${job.id}/${action}`, bodies[action] ?? {}).expect(404);
      }
      await rider(other, 'get', `/jobs/${job.id}`).expect(404);
      expect((await rider(r, 'post', `/jobs/${job.id}/complete`, { otp: '1234' }).expect(400)).body.error.code).toBe('PROOF_NOT_NEEDED');
      await rider(r, 'post', `/jobs/${job.id}/complete`, { otp: 'abcd' }).expect(400);
    });

    it('reporting a failure marks the job failed, leaves the order alone, and alerts ops', async () => {
      const r = await createRider(t, basics);
      const sc = await orderScenario(t, basics);
      const order = await acceptedOrder(http, t, sc, () => placeOrder(http, sc));
      const job = await jobOf(t, order.id, JobType.PICKUP);
      await rider(r, 'post', `/jobs/${job.id}/fail`, { reason: 'Customer unreachable' }).expect(404); // not theirs yet
      await rider(r, 'post', `/jobs/${job.id}/claim`).expect(200);
      await rider(r, 'post', `/jobs/${job.id}/fail`, {}).expect(400);
      await rider(r, 'post', `/jobs/${job.id}/fail`, { reason: 'Customer unreachable' }).expect(200);

      expect(await reload(job.id)).toMatchObject({ status: 'FAILED', failureReason: 'Customer unreachable' });
      expect(await statusOf(order.id)).toBe('ACCEPTED');
      expect(alert).toHaveBeenCalledWith('A delivery job failed', expect.stringContaining('Customer unreachable'), expect.anything());
    });
  });

  describe('delivery leg and proof', () => {
    it('setting out marks the order OUT_FOR_DELIVERY and sends the customer a code; the right code completes it', async () => {
      const r = await createRider(t, basics, { name: 'Bilal' });
      const { s, order, drop } = await readyForDelivery(r);
      await rider(r, 'post', `/jobs/${drop.id}/claim`).expect(200);
      expect(lastCode()).toBeUndefined(); // no code until they set out

      await rider(r, 'post', `/jobs/${drop.id}/start`).expect(200);
      expect(await statusOf(order.id)).toBe('OUT_FOR_DELIVERY');
      const code = lastCode();
      expect(code).toMatch(/^\d{4}$/);
      expect(notify).toHaveBeenCalledWith(s.customer.user.id, 'delivery_code', expect.objectContaining({ orderNo: expect.any(String) }), expect.anything(), expect.anything(), expect.anything());

      // Only a hash is stored, and the notification log does not keep the code.
      const row = await reload(drop.id);
      expect(row.proofOtpHash).toBeTruthy();
      expect(row.proofOtpHash).not.toContain(code);
      expect(row.proofOtpExpiresAt!.getTime()).toBeGreaterThan(NOW.getTime());
      const logged = await t.prisma.notification.findFirstOrThrow({ where: { userId: s.customer.user.id, template: 'delivery_code' } });
      expect(JSON.stringify(logged.payload)).not.toContain(code);

      expect((await rider(r, 'post', `/jobs/${drop.id}/complete`, {}).expect(400)).body.error.code).toBe('PROOF_REQUIRED');
      const wrong = await rider(r, 'post', `/jobs/${drop.id}/complete`, { otp: code === '0000' ? '1111' : '0000' }).expect(400);
      expect(wrong.body.error).toMatchObject({ code: 'INVALID_DELIVERY_OTP', details: { attemptsLeft: 4 } });
      expect(await statusOf(order.id)).toBe('OUT_FOR_DELIVERY');

      const ok = await rider(r, 'post', `/jobs/${drop.id}/complete`, { otp: code }).expect(200);
      expect(ok.body.data).toMatchObject({ status: 'COMPLETED' });
      expect(await statusOf(order.id)).toBe('DELIVERED');
      expect(await reload(drop.id)).toMatchObject({ proofType: 'OTP', proofOtpHash: null });
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).deliveredAt).not.toBeNull();
    });

    it('stops guessing: five wrong codes lock the code (even the right one), parallel guesses included; a photo still works', async () => {
      const r = await createRider(t, basics);
      const { drop, order } = await outForDelivery(r);
      const code = lastCode();
      const wrong = code === '1234' ? '4321' : '1234';

      const burst = await Promise.all(Array.from({ length: 10 }, () => rider(r, 'post', `/jobs/${drop.id}/complete`, { otp: wrong })));
      const counts = burst.reduce<Record<number, number>>((acc, x) => ({ ...acc, [x.status]: (acc[x.status] ?? 0) + 1 }), {});
      expect(counts).toEqual({ 400: 5, 429: 5 });
      expect(burst.find((x) => x.status === 429)!.body.error.code).toBe('DELIVERY_OTP_LOCKED');
      expect((await reload(drop.id)).proofOtpAttempts).toBe(5);

      const rightButLocked = await rider(r, 'post', `/jobs/${drop.id}/complete`, { otp: code }).expect(429);
      expect(rightButLocked.body.error.code).toBe('DELIVERY_OTP_LOCKED');
      expect(await statusOf(order.id)).toBe('OUT_FOR_DELIVERY');

      const photo = await rider(r, 'post', `/jobs/${drop.id}/complete`, { proofPhotoPublicId: proofPhotoFor(r) }).expect(200);
      expect(photo.body.data).toMatchObject({ status: 'COMPLETED' });
      expect(await reload(drop.id)).toMatchObject({ proofType: 'PHOTO', proofPhotoUrl: expect.stringContaining('doorstep') });
      expect(await statusOf(order.id)).toBe('DELIVERED');
    });

    it('rejects a proof photo that is not in the rider’s own proof folder', async () => {
      const r = await createRider(t, basics);
      const other = await createRider(t, basics, { lat: 31.6 });
      const { drop } = await outForDelivery(r);
      const res = await rider(r, 'post', `/jobs/${drop.id}/complete`, { proofPhotoPublicId: proofPhotoFor(other) }).expect(400);
      expect(res.body.error.code).toBe('MEDIA_INVALID_ASSET');
      expect((await reload(drop.id)).status).toBe('IN_TRANSIT');
    });

    it('a code expires after the configured time', async () => {
      const r = await createRider(t, basics);
      const { drop } = await outForDelivery(r);
      const code = lastCode();
      clock.set(new Date(NOW.getTime() + 25 * 3_600_000));
      const res = await rider(r, 'post', `/jobs/${drop.id}/complete`, { otp: code }).expect(400);
      expect(res.body.error.code).toBe('DELIVERY_OTP_EXPIRED');
    });

    it('the customer can ask for a new code: the old one stops working; asking is limited and customers only', async () => {
      const r = await createRider(t, basics);
      const { s, order, drop } = await outForDelivery(r);
      const first = lastCode();

      await http.post(`/api/v1/orders/${order.id}/delivery-code/resend`).set(s.customer.auth).expect(200);
      const second = lastCode();
      if (second !== first) {
        expect((await rider(r, 'post', `/jobs/${drop.id}/complete`, { otp: first }).expect(400)).body.error.code).toBe('INVALID_DELIVERY_OTP');
      }
      await http.post(`/api/v1/orders/${order.id}/delivery-code/resend`).set(s.customer.auth).expect(200);
      await http.post(`/api/v1/orders/${order.id}/delivery-code/resend`).set(s.customer.auth).expect(200);
      expect((await http.post(`/api/v1/orders/${order.id}/delivery-code/resend`).set(s.customer.auth).expect(429)).body.error.code).toBe('RATE_LIMITED');

      await http.post(`/api/v1/orders/${order.id}/delivery-code/resend`).set((await createCustomer(t)).auth).expect(404);
      await http.post(`/api/v1/orders/${order.id}/delivery-code/resend`).set(r.auth).expect(403);

      await rider(r, 'post', `/jobs/${drop.id}/complete`, { otp: lastCode() }).expect(200);
      await clearRateLimits(t.redis);
      const after = await http.post(`/api/v1/orders/${order.id}/delivery-code/resend`).set(s.customer.auth).expect(409);
      expect(after.body.error.code).toBe('NO_DELIVERY_IN_PROGRESS');
    });

    it('setting out on a delivery that was only offered (not accepted) changes nothing, including the order', async () => {
      const r = await createRider(t, basics);
      const { drop, order } = await readyForDelivery(r);
      await t.prisma.deliveryJob.update({ where: { id: drop.id }, data: { status: 'ASSIGNED', riderId: r.rider.id, assignedAt: NOW } });
      const res = await rider(r, 'post', `/jobs/${drop.id}/start`).expect(409);
      expect(res.body.error.code).toBe('JOB_INVALID_TRANSITION');
      expect(await statusOf(order.id)).toBe('READY');
      expect((await reload(drop.id)).status).toBe('ASSIGNED');
    });

    it('a wrong-rider or too-early completion changes nothing', async () => {
      const r = await createRider(t, basics);
      const other = await createRider(t, basics, { lat: 31.6 });
      const { drop, order } = await readyForDelivery(r);
      await rider(r, 'post', `/jobs/${drop.id}/claim`).expect(200);
      expect((await rider(r, 'post', `/jobs/${drop.id}/complete`, { otp: '1234' }).expect(409)).body.error.code).toBe('JOB_INVALID_TRANSITION'); // not started
      await rider(r, 'post', `/jobs/${drop.id}/start`).expect(200);
      await rider(other, 'post', `/jobs/${drop.id}/complete`, { otp: lastCode() }).expect(404);
      expect(await statusOf(order.id)).toBe('OUT_FOR_DELIVERY');
    });
  });

  describe('what the customer sees', () => {
    it('shows each leg with the rider’s name and photo (no contact details), and the live position only while on the way', async () => {
      const r = await createRider(t, basics, { name: 'Bilal', lat: 31.55, lng: 74.31 });
      const { s, order, drop } = await readyForDelivery(r);

      let legs = (await http.get(`/api/v1/orders/${order.id}/delivery`).set(s.customer.auth).expect(200)).body.data;
      expect(legs).toHaveLength(2);
      expect(legs.find((l: { jobType: string }) => l.jobType === 'PICKUP')).toMatchObject({ status: 'COMPLETED', handledBy: 'RIDER', rider: { name: 'Bilal', photoUrl: expect.stringContaining('rider') } });
      expect(legs.find((l: { jobType: string }) => l.jobType === 'DROP')).toMatchObject({ status: 'UNASSIGNED', handledBy: null, rider: null });
      expect(JSON.stringify(legs)).not.toContain(r.user.phone);

      await http.get(`/api/v1/orders/${order.id}/rider-location`).set(s.customer.auth).expect(404); // not on the way yet
      await rider(r, 'post', `/jobs/${drop.id}/claim`).expect(200);
      await rider(r, 'post', `/jobs/${drop.id}/start`).expect(200);
      await rider(r, 'post', '/location', { lat: 31.56, lng: 74.32 }).expect(200);

      const where = await http.get(`/api/v1/orders/${order.id}/rider-location`).set(s.customer.auth).expect(200);
      expect(where.body.data).toMatchObject({ jobType: 'DROP', lat: 31.56, lng: 74.32 });
      expect(JSON.stringify(where.body)).not.toContain(r.rider.id);

      const stranger = await createCustomer(t);
      await http.get(`/api/v1/orders/${order.id}/delivery`).set(stranger.auth).expect(404);
      await http.get(`/api/v1/orders/${order.id}/rider-location`).set(stranger.auth).expect(404);

      await rider(r, 'post', `/jobs/${drop.id}/complete`, { otp: lastCode() }).expect(200);
      await http.get(`/api/v1/orders/${order.id}/rider-location`).set(s.customer.auth).expect(404);
      legs = (await http.get(`/api/v1/orders/${order.id}/delivery`).set(s.customer.auth).expect(200)).body.data;
      expect(legs.map((l: { status: string }) => l.status)).toEqual(['COMPLETED', 'COMPLETED']);
    });
  });

  describe("the rider's own lists and earnings", () => {
    it('active jobs list what they hold; history lists finished ones newest first with paging; earnings add up per day', async () => {
      const r = await createRider(t, basics);
      const idle = await createRider(t, basics, { lat: 31.7 });
      const a = await outForDelivery(r); // pickup (80) completed; drop in transit
      await rider(r, 'post', `/jobs/${a.drop.id}/complete`, { otp: lastCode() }).expect(200); // drop (120)
      const b = await readyForDelivery(r); // second pickup (80) completed; drop unassigned
      void b;

      const active = (await rider(r, 'get', '/jobs').expect(200)).body.data;
      expect(active).toEqual([]); // nothing in progress
      const hist = await rider(r, 'get', '/jobs?view=history&limit=2').expect(200);
      expect(hist.body.data).toHaveLength(2);
      expect(hist.body.meta.nextCursor).toBeTruthy();
      const page2 = await rider(r, 'get', `/jobs?view=history&limit=2&cursor=${hist.body.meta.nextCursor}`).expect(200);
      expect(page2.body.data).toHaveLength(1);
      expect([...hist.body.data, ...page2.body.data].map((j: { status: string }) => j.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);

      const earnings = (await rider(r, 'get', '/earnings').expect(200)).body.data;
      expect(earnings.totals).toEqual({ jobs: 3, earned: '280.00' });
      expect(earnings.days).toEqual([{ day: '2026-10-23', jobs: 3, earned: '280.00' }]);
      expect(earnings).toMatchObject({ currency: 'PKR', from: '2026-10-17', to: '2026-10-23' });

      const none = (await rider(idle, 'get', '/earnings').expect(200)).body.data;
      expect(none.totals).toEqual({ jobs: 0, earned: '0.00' });

      const me = (await rider(r, 'get', '/me').expect(200)).body.data;
      expect(me.today).toEqual({ day: '2026-10-23', jobs: 3, earned: '280.00' });
      expect(me).toMatchObject({ activeJobs: 0, maxActiveJobs: 3 });
    });

    it('validates the earnings range', async () => {
      const r = await createRider(t, basics);
      await rider(r, 'get', '/earnings?from=2026-10-20&to=2026-10-10').expect(400);
      await rider(r, 'get', '/earnings?from=2026-01-01&to=2026-10-10').expect(400);
      await rider(r, 'get', '/earnings?from=yesterday').expect(400);
      const range = (await rider(r, 'get', '/earnings?from=2026-10-01&to=2026-10-03').expect(200)).body.data;
      expect(range.days).toEqual([]);
    });

    it('a suspended rider can still read their earnings but not take work', async () => {
      const r = await createRider(t, basics, { status: 'SUSPENDED' });
      await rider(r, 'get', '/earnings').expect(200);
      await rider(r, 'get', '/jobs').expect(403);
    });

    it('active jobs show the offer deadline for an offered job', async () => {
      const r = await createRider(t, basics);
      const sc = await orderScenario(t, basics);
      const order = await acceptedOrder(http, t, sc, () => placeOrder(http, sc));
      const job = await jobOf(t, order.id, JobType.PICKUP);
      await t.prisma.deliveryJob.update({ where: { id: job.id }, data: { status: 'ASSIGNED', riderId: r.rider.id, assignedAt: NOW } });
      const mine = (await rider(r, 'get', '/jobs').expect(200)).body.data;
      expect(mine[0]).toMatchObject({ id: job.id, status: 'ASSIGNED', nextActions: expect.arrayContaining(['ACCEPTED', 'UNASSIGNED']) });
      expect(new Date(mine[0].offerExpiresAt).getTime()).toBe(NOW.getTime() + 90_000);
    });
  });

  it('the whole journey: place -> accept -> pickup -> wash -> ready -> delivery -> delivered, in order', async () => {
    const r = await createRider(t, basics);
    const { order } = await outForDelivery(r);
    await rider(r, 'post', `/jobs/${(await jobOf(t, order.id, JobType.DROP)).id}/complete`, { otp: lastCode() }).expect(200);
    const history = await t.prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, orderBy: { seq: 'asc' } });
    expect(history.map((h) => [h.toStatus, h.actorRole])).toEqual([
      ['PLACED', 'CUSTOMER'],
      ['ACCEPTED', 'VENDOR_OWNER'],
      ['PICKED_UP', 'RIDER'],
      ['IN_PROCESS', 'VENDOR_OWNER'],
      ['READY', 'VENDOR_OWNER'],
      ['OUT_FOR_DELIVERY', 'RIDER'],
      ['DELIVERED', 'RIDER'],
    ]);
  });
});
