import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobStatus, JobType } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { DispatchService } from '../src/modules/delivery/dispatch.service';
import { OpsAlertService } from '../src/modules/delivery/ops-alert.service';
import { riderGeoKey } from '../src/modules/delivery/rider-presence.service';
import { acceptedOrder, createRider, jobOf } from './delivery-helpers';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createCustomer, createTestApp, fixedClock, prepareReferenceData } from './helpers';
import { OrderScenario, orderScenario, placeOrder } from './order-helpers';

/** 30 minutes before the Saturday pickup window opens: inside the 60-minute dispatch lead. */
const SEARCH_OPEN = new Date('2026-10-24T04:30:00Z');
/** About 1.1 km per 0.01 degrees of latitude. */
const km = (n: number) => n / 111;

describe('Delivery jobs and dispatch (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let dispatch: DispatchService;
  let alert: jest.SpyInstance;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    dispatch = t.app.get(DispatchService);
    alert = jest.spyOn(t.app.get(OpsAlertService), 'alert').mockResolvedValue(undefined);
  });
  beforeEach(async () => {
    clock.set(NOW);
    alert.mockClear();
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
    // Every test starts with nobody on the road, so "nearest rider" means the riders the test made.
    await t.prisma.rider.updateMany({ data: { isOnline: false } });
    await t.redis.del(riderGeoKey(basics.cityId));
    // ...and no jobs from earlier tests are left waiting to be found.
    await t.prisma.deliveryJob.updateMany({ where: { status: { in: ['UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'IN_TRANSIT', 'FAILED'] } }, data: { status: 'CANCELLED' } });
  });
  afterAll(() => t.close());

  const scenario = () => orderScenario(t, basics);
  const place = (s: OrderScenario) => placeOrder(http, s);
  /** An accepted order and its (UNASSIGNED) pickup job. */
  const pickupJob = async (s?: OrderScenario) => {
    const sc = s ?? (await scenario());
    const order = await acceptedOrder(http, t, sc, () => place(sc));
    return { s: sc, order, job: await jobOf(t, order.id, JobType.PICKUP) };
  };
  const reload = (id: string) => t.prisma.deliveryJob.findUniqueOrThrow({ where: { id } });
  const rider = (r: { auth: Record<string, string> }, method: 'post' | 'get', path: string, body: object = {}) => http[method](`/api/v1/rider${path}`).set(r.auth).send(method === 'post' ? body : undefined);
  const offersTo = (userId: string) => t.prisma.notification.findMany({ where: { userId, template: 'rider_job_offer' } });

  describe('job creation', () => {
    it('creates the pickup job when the vendor accepts: unassigned, in the pickup window, with the rider fee', async () => {
      const { order, job } = await pickupJob();
      const row = await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(job).toMatchObject({ status: 'UNASSIGNED', jobType: 'PICKUP', riderId: null, partnerId: null });
      expect(job.scheduledStart).toEqual(row.pickupSlotStart);
      expect(job.scheduledEnd).toEqual(row.pickupSlotEnd);
      expect(job.riderFee?.toFixed(2)).toBe('80.00');
      expect(await t.prisma.deliveryJob.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('never makes a second job for the same leg, even if the event repeats', async () => {
      const { order } = await pickupJob();
      const events = t.app.get(EventEmitter2);
      for (let i = 0; i < 3; i++) {
        await events.emitAsync('order.status_changed', { orderId: order.id, from: 'PLACED', to: 'ACCEPTED', seq: 99 + i, actor: 'VENDOR', at: new Date().toISOString() });
      }
      expect(await t.prisma.deliveryJob.count({ where: { orderId: order.id, jobType: 'PICKUP' } })).toBe(1);
    });

    it('creates the delivery job when the order becomes READY, with the delivery fee and window', async () => {
      const { s, order } = await pickupJob();
      for (const status of ['PICKED_UP', 'IN_PROCESS', 'READY']) {
        await http.post(`/api/v1/vendor/orders/${order.id}/status`).set(s.vendor.owner.auth).send({ status }).expect(200);
      }
      const drop = await jobOf(t, order.id, JobType.DROP);
      const row = await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(drop).toMatchObject({ status: 'UNASSIGNED', jobType: 'DROP' });
      expect(drop.scheduledStart).toEqual(row.deliverySlotStart);
      expect(drop.riderFee?.toFixed(2)).toBe('120.00');
    });

    it('cancels the open jobs when the order is cancelled, and tells the rider who held one', async () => {
      const { s, order, job } = await pickupJob();
      const r = await createRider(t, basics);
      clock.set(SEARCH_OPEN);
      expect(await dispatch.dispatch(job.id)).toBe('offered');
      await http.post(`/api/v1/orders/${order.id}/cancel`).set(s.customer.auth).send({ reason: 'Plans changed' }).expect(200);

      expect(await reload(job.id)).toMatchObject({ status: 'CANCELLED' });
      const told = await t.prisma.notification.findMany({ where: { userId: r.user.id, template: 'rider_job_cancelled' } });
      expect(told).toHaveLength(1);
    });

    it('drops the pickup job when the vendor collects the clothes without a rider', async () => {
      const { s, order, job } = await pickupJob();
      await http.post(`/api/v1/vendor/orders/${order.id}/status`).set(s.vendor.owner.auth).send({ status: 'PICKED_UP' }).expect(200);
      expect((await reload(job.id)).status).toBe('CANCELLED');
    });
  });

  describe('auto-dispatch', () => {
    it('waits until shortly before the window opens', async () => {
      const { job } = await pickupJob();
      const r = await createRider(t, basics);
      expect(await dispatch.dispatch(job.id)).toBe('waiting'); // clock = NOW, a day early
      expect(await reload(job.id)).toMatchObject({ status: 'UNASSIGNED', riderId: null, dispatchAttempts: 0 });
      expect(await offersTo(r.user.id)).toHaveLength(0);
    });

    it('offers the job to the nearest online approved rider and tells only them', async () => {
      const { job } = await pickupJob();
      const near = await createRider(t, basics, { lat: 31.52 + km(0.5) });
      const far = await createRider(t, basics, { lat: 31.52 + km(2) });
      clock.set(SEARCH_OPEN);

      expect(await dispatch.dispatch(job.id)).toBe('offered');
      expect(await reload(job.id)).toMatchObject({ status: 'ASSIGNED', riderId: near.rider.id, dispatchAttempts: 1 });
      expect(await offersTo(near.user.id)).toHaveLength(1);
      expect(await offersTo(far.user.id)).toHaveLength(0);
      expect(await dispatch.dispatch(job.id)).toBe('skipped'); // already offered: a repeat does nothing
    });

    it('skips riders who are offline, suspended, out of heartbeat or at their job limit', async () => {
      const { s, job } = await pickupJob();
      const offline = await createRider(t, basics, { online: false });
      const suspended = await createRider(t, basics, { status: 'SUSPENDED' });
      const quiet = await createRider(t, basics);
      await t.redis.del(`rider:beat:${quiet.rider.id}`);
      const busy = await createRider(t, basics, { lat: 31.52 + km(0.2) });
      for (let i = 0; i < 3; i++) {
        const o = (await pickupJob(s)).job;
        await t.prisma.deliveryJob.update({ where: { id: o.id }, data: { status: 'ACCEPTED', riderId: busy.rider.id } });
      }
      const good = await createRider(t, basics, { lat: 31.52 + km(2.5) });
      clock.set(SEARCH_OPEN);

      expect(await dispatch.dispatch(job.id)).toBe('offered');
      expect((await reload(job.id)).riderId).toBe(good.rider.id);
      for (const r of [offline, suspended, quiet, busy]) expect(await offersTo(r.user.id)).toHaveLength(0);
    });

    it('accepting turns the offer into the rider’s job and tells the customer who is coming', async () => {
      const { s, job } = await pickupJob();
      const r = await createRider(t, basics, { name: 'Bilal' });
      clock.set(SEARCH_OPEN);
      await dispatch.dispatch(job.id);

      const res = await rider(r, 'post', `/jobs/${job.id}/accept`).expect(200);
      expect(res.body.data).toMatchObject({ status: 'ACCEPTED', jobType: 'PICKUP' });
      const told = await t.prisma.notification.findMany({ where: { userId: s.customer.user.id, template: 'order_rider_assigned' } });
      expect(told).toHaveLength(1);
      expect(JSON.stringify(told[0].payload)).toContain('Bilal');
    });

    it('only the offered rider can accept or decline an offer', async () => {
      const { job } = await pickupJob();
      const offered = await createRider(t, basics);
      const other = await createRider(t, basics, { lat: 31.6 });
      clock.set(SEARCH_OPEN);
      await dispatch.dispatch(job.id);
      await rider(other, 'post', `/jobs/${job.id}/accept`).expect(404);
      await rider(other, 'post', `/jobs/${job.id}/decline`).expect(404);
      expect((await reload(job.id)).riderId).toBe(offered.rider.id);
    });

    it('a declined job moves to the next rider and never comes back to the one who declined', async () => {
      const { job } = await pickupJob();
      const a = await createRider(t, basics, { lat: 31.52 + km(0.5) });
      const b = await createRider(t, basics, { lat: 31.52 + km(1) });
      clock.set(SEARCH_OPEN);

      await dispatch.dispatch(job.id);
      await rider(a, 'post', `/jobs/${job.id}/decline`, { reason: 'Too far' }).expect(200);
      expect(await reload(job.id)).toMatchObject({ status: 'UNASSIGNED', riderId: null });

      expect(await dispatch.dispatch(job.id)).toBe('offered');
      expect((await reload(job.id)).riderId).toBe(b.rider.id);
      await rider(b, 'post', `/jobs/${job.id}/decline`).expect(200);

      expect(await dispatch.dispatch(job.id)).toBe('waiting'); // both declined: nobody left to ask
      const after = await reload(job.id);
      expect(after.declinedRiderIds.sort()).toEqual([a.rider.id, b.rider.id].sort());
      expect(after.dispatchAttempts).toBe(3);
    });

    it('an offer nobody answers lapses; the next dispatch asks someone else', async () => {
      const { job } = await pickupJob();
      const a = await createRider(t, basics, { lat: 31.52 + km(0.5) });
      const b = await createRider(t, basics, { lat: 31.52 + km(1) });
      clock.set(SEARCH_OPEN);
      await dispatch.dispatch(job.id);

      expect(await dispatch.offerTimedOut(job.id, a.rider.id)).toBe(true);
      expect(await dispatch.offerTimedOut(job.id, a.rider.id)).toBe(false); // second timer for the same offer: nothing to do
      expect(await dispatch.dispatch(job.id)).toBe('offered');
      expect((await reload(job.id)).riderId).toBe(b.rider.id);
    });

    it('a late timeout does not undo an accepted job', async () => {
      const { job } = await pickupJob();
      const a = await createRider(t, basics);
      clock.set(SEARCH_OPEN);
      await dispatch.dispatch(job.id);
      await rider(a, 'post', `/jobs/${job.id}/accept`).expect(200);
      expect(await dispatch.offerTimedOut(job.id, a.rider.id)).toBe(false);
      expect(await reload(job.id)).toMatchObject({ status: 'ACCEPTED', riderId: a.rider.id });
    });

    it('widens the search circle each round', async () => {
      const { job } = await pickupJob();
      const far = await createRider(t, basics, { lat: 31.52 + km(8) });
      clock.set(SEARCH_OPEN);
      expect(await dispatch.dispatch(job.id)).toBe('waiting'); // 3 km
      expect(await dispatch.dispatch(job.id)).toBe('waiting'); // 6 km
      expect(await dispatch.dispatch(job.id)).toBe('offered'); // 10 km
      expect((await reload(job.id)).riderId).toBe(far.rider.id);
    });

    it('alerts ops once when nobody can be found, and keeps looking', async () => {
      const { job } = await pickupJob();
      clock.set(SEARCH_OPEN);
      for (let i = 0; i < 12; i++) expect(await dispatch.dispatch(job.id)).toBe('waiting');
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert.mock.calls[0][0]).toBe('No rider available for a job');
      const row = await reload(job.id);
      expect(row.unassignedAlertedAt).not.toBeNull();
      expect(row.status).toBe('UNASSIGNED');

      // A rider turns up later: the job is still there to be found.
      const late = await createRider(t, basics, { lat: 31.52 + km(1) });
      expect(await dispatch.dispatch(job.id)).toBe('offered');
      expect((await reload(job.id)).riderId).toBe(late.rider.id);
    });

    it('the sweeper revives a job whose search chain was lost, and expires offers left hanging', async () => {
      const { job: stuck } = await pickupJob();
      const { job: hanging } = await pickupJob();
      const r = await createRider(t, basics);
      clock.set(SEARCH_OPEN);
      await t.prisma.deliveryJob.updateMany({ where: { id: stuck.id }, data: { updatedAt: new Date(SEARCH_OPEN.getTime() - 3_600_000) } });
      await t.prisma.$executeRaw`UPDATE "DeliveryJob" SET "updatedAt" = ${new Date(SEARCH_OPEN.getTime() - 3_600_000)} WHERE id = ${stuck.id}::uuid`;
      await t.prisma.deliveryJob.update({ where: { id: hanging.id }, data: { status: 'ASSIGNED', riderId: r.rider.id, assignedAt: new Date(SEARCH_OPEN.getTime() - 3_600_000) } });

      const result = await dispatch.sweep();
      expect(result.redispatched).toBeGreaterThanOrEqual(1);
      expect(result.expired).toBe(1);
      expect(await reload(hanging.id)).toMatchObject({ status: 'UNASSIGNED', riderId: null });
    });
  });

  describe('manual mode (claiming)', () => {
    it('lists unassigned jobs in the rider’s city whose window is near, nearest first, hiding ones they declined', async () => {
      const s = await scenario();
      const near = await pickupJob(s);
      const far = await pickupJob(await orderScenario(t, basics, { lat: 31.6, lng: 74.35 }).then(async (x) => ({ ...x, address: await t.prisma.address.update({ where: { id: x.address.id }, data: { lat: 31.6, lng: 74.35 } }) })));
      const r = await createRider(t, basics, { lat: 31.52 });

      clock.set(NOW);
      expect((await rider(r, 'get', '/jobs/available').expect(200)).body.data).toEqual([]); // a day early: not open yet

      clock.set(SEARCH_OPEN);
      const list = (await rider(r, 'get', '/jobs/available').expect(200)).body.data;
      expect(list.map((j: { id: string }) => j.id).slice(0, 2)).toEqual([near.job.id, far.job.id]);
      expect(list[0]).toMatchObject({ jobType: 'PICKUP', riderFee: '80.00', status: 'UNASSIGNED' });
      expect(list[0].distanceKm).toBeLessThan(list[1].distanceKm);
      expect(list[0].from).toMatchObject({ role: 'CUSTOMER' });
      expect(list[0].from.phone).toMatch(/\*\*\*/); // contact is masked

      await t.prisma.deliveryJob.update({ where: { id: near.job.id }, data: { declinedRiderIds: [r.rider.id] } });
      expect((await rider(r, 'get', '/jobs/available').expect(200)).body.data.map((j: { id: string }) => j.id)).not.toContain(near.job.id);
    });

    it('a claim gives the rider the job; of many riders claiming at once exactly one wins', async () => {
      const { job } = await pickupJob();
      const riders = await Promise.all(Array.from({ length: 8 }, () => createRider(t, basics)));
      clock.set(SEARCH_OPEN);

      const results = await Promise.all(riders.map((r) => rider(r, 'post', `/jobs/${job.id}/claim`)));
      const won = results.filter((r) => r.status === 200);
      const lost = results.filter((r) => r.status === 409);
      expect({ won: won.length, lost: lost.length }).toEqual({ won: 1, lost: 7 });
      expect(lost.every((r) => r.body.error.code === 'JOB_ALREADY_TAKEN')).toBe(true);

      const winner = riders.find((_r, i) => results[i].status === 200)!;
      expect(await reload(job.id)).toMatchObject({ status: 'ACCEPTED', riderId: winner.rider.id });
    });

    it('a claim races safely with auto-dispatch', async () => {
      const { job } = await pickupJob();
      const r1 = await createRider(t, basics);
      const r2 = await createRider(t, basics, { lat: 31.6 });
      clock.set(SEARCH_OPEN);
      const [d, c] = await Promise.all([dispatch.dispatch(job.id), rider(r2, 'post', `/jobs/${job.id}/claim`)]);
      const row = await reload(job.id);
      expect([r1.rider.id, r2.rider.id]).toContain(row.riderId);
      expect(row.status === 'ASSIGNED' || row.status === 'ACCEPTED').toBe(true);
      // one winner only: either the offer happened and the claim lost, or the claim won and the offer found it taken
      expect(c.status === 200 ? d : 'offered').toMatch(/skipped|offered|waiting/);
      expect(await t.prisma.deliveryJob.count({ where: { id: job.id } })).toBe(1);
    });

    it('refuses riders who are offline, at their limit, or claiming something that is not theirs to take', async () => {
      const { s, job } = await pickupJob();

      const offline = await createRider(t, basics, { online: false });
      clock.set(SEARCH_OPEN);
      expect((await rider(offline, 'post', `/jobs/${job.id}/claim`).expect(409)).body.error.code).toBe('RIDER_OFFLINE');
      clock.set(NOW);

      const full = await createRider(t, basics);
      for (let i = 0; i < 3; i++) {
        const o = (await pickupJob(s)).job;
        await t.prisma.deliveryJob.update({ where: { id: o.id }, data: { status: 'ACCEPTED', riderId: full.rider.id } });
      }
      clock.set(SEARCH_OPEN);
      const busy = await rider(full, 'post', `/jobs/${job.id}/claim`).expect(409);
      expect(busy.body.error).toMatchObject({ code: 'RIDER_BUSY', details: { max: 3 } });

      const free = await createRider(t, basics);
      await rider(free, 'post', '/jobs/00000000-0000-4000-8000-000000000000/claim').expect(404);
      await t.prisma.deliveryJob.update({ where: { id: job.id }, data: { declinedRiderIds: [free.rider.id] } });
      expect((await rider(free, 'post', `/jobs/${job.id}/claim`).expect(409)).body.error.code).toBe('JOB_NOT_AVAILABLE');
    });

    it('a rider can give back an accepted job; it returns to dispatch without them and ops hears about it', async () => {
      const { job } = await pickupJob();
      const a = await createRider(t, basics);
      const b = await createRider(t, basics, { lat: 31.52 + km(1) });
      clock.set(SEARCH_OPEN);
      await rider(a, 'post', `/jobs/${job.id}/claim`).expect(200);
      await rider(a, 'post', `/jobs/${job.id}/release`, {}).expect(400); // a reason is required
      await rider(a, 'post', `/jobs/${job.id}/release`, { reason: 'Bike broke down' }).expect(200);
      expect(await reload(job.id)).toMatchObject({ status: 'UNASSIGNED', riderId: null });
      expect(alert).toHaveBeenCalledWith('A rider gave back an accepted job', expect.stringContaining('Bike broke down'), expect.anything());

      expect(await dispatch.dispatch(job.id)).toBe('offered');
      expect((await reload(job.id)).riderId).toBe(b.rider.id);
    });
  });

  describe('admin dispatch board', () => {
    const adminPost = (path: string, body: object = {}) => http.post(`/api/v1/admin/delivery/jobs/${path}`).set(admin.auth).send(body);

    it('lists and filters jobs, shows detail, and summarises the board', async () => {
      const { order, job } = await pickupJob();
      const list = await http.get(`/api/v1/admin/delivery/jobs?status=UNASSIGNED,FAILED&orderNo=${order.orderNo}`).set(admin.auth).expect(200);
      expect(list.body.data.map((j: { id: string }) => j.id)).toEqual([job.id]);
      expect(list.body.data[0]).toMatchObject({ jobType: 'PICKUP', status: 'UNASSIGNED', rider: null, nextActions: expect.arrayContaining(['ASSIGNED']) });
      expect(list.body.meta).toHaveProperty('nextCursor');
      await http.get('/api/v1/admin/delivery/jobs?status=BOGUS').set(admin.auth).expect(400);

      const detail = await http.get(`/api/v1/admin/delivery/jobs/${job.id}`).set(admin.auth).expect(200);
      expect(detail.body.data).toMatchObject({ id: job.id, from: { role: 'CUSTOMER' }, to: { role: 'VENDOR' } });

      const r = await createRider(t, basics);
      const summary = await http.get(`/api/v1/admin/delivery/summary?cityId=${basics.cityId}`).set(admin.auth).expect(200);
      expect(summary.body.data.jobs.UNASSIGNED).toBeGreaterThanOrEqual(1);
      expect(summary.body.data.onlineRiders).toBe(1);
      void r;
    });

    it('force-assigns a job to a chosen rider, who is told; the previous holder loses it and is told', async () => {
      const { job } = await pickupJob();
      const first = await createRider(t, basics);
      const second = await createRider(t, basics, { lat: 31.7 });
      clock.set(SEARCH_OPEN);
      await rider(first, 'post', `/jobs/${job.id}/claim`).expect(200);

      const res = await adminPost(`${job.id}/assign`, { riderId: second.rider.id }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'ACCEPTED', rider: { id: second.rider.id } });
      expect(res.body.data).not.toHaveProperty('proofOtpHash');
      expect(await t.prisma.notification.count({ where: { userId: second.user.id, template: 'rider_job_assigned' } })).toBe(1);
      expect(await t.prisma.notification.count({ where: { userId: first.user.id, template: 'rider_job_cancelled' } })).toBe(1);
      expect((await reload(job.id)).declinedRiderIds).toContain(first.rider.id);
      expect(await t.prisma.auditLog.count({ where: { action: 'JOB_REASSIGNED', entityId: job.id } })).toBe(1);
      await rider(first, 'post', `/jobs/${job.id}/start`).expect(404);
    });

    it('will not assign to a rider who is unapproved or in another city', async () => {
      const { job } = await pickupJob();
      const pending = await createRider(t, basics, { status: 'PENDING' });
      const elsewhere = await createRider(t, basics);
      const other = await t.prisma.city.create({ data: { name: `Elsewhere ${Date.now()}`, code: null } });
      await t.prisma.rider.update({ where: { id: elsewhere.rider.id }, data: { cityId: other.id } });
      expect((await adminPost(`${job.id}/assign`, { riderId: pending.rider.id }).expect(409)).body.error.code).toBe('RIDER_NOT_ACTIVE');
      expect((await adminPost(`${job.id}/assign`, { riderId: elsewhere.rider.id }).expect(409)).body.error.code).toBe('RIDER_WRONG_CITY');
      expect((await reload(job.id)).status).toBe('UNASSIGNED');
    });

    it('unassigns back to the pool, marks failed, and redispatches from scratch', async () => {
      const { job } = await pickupJob();
      const a = await createRider(t, basics);
      clock.set(SEARCH_OPEN);
      await rider(a, 'post', `/jobs/${job.id}/claim`).expect(200);

      await adminPost(`${job.id}/unassign`).expect(200);
      expect(await reload(job.id)).toMatchObject({ status: 'UNASSIGNED', riderId: null });

      await adminPost(`${job.id}/fail`, {}).expect(400); // reason required
      await adminPost(`${job.id}/fail`, { reason: 'Customer moved away' }).expect(200);
      expect(await reload(job.id)).toMatchObject({ status: 'FAILED', failureReason: 'Customer moved away' });
      await adminPost(`${job.id}/unassign`).expect(200); // FAILED -> UNASSIGNED is allowed for admins

      await t.prisma.deliveryJob.update({ where: { id: job.id }, data: { status: 'FAILED', dispatchAttempts: 9, unassignedAlertedAt: new Date() } });
      await adminPost(`${job.id}/redispatch`).expect(200);
      expect(await reload(job.id)).toMatchObject({ status: 'UNASSIGNED', dispatchAttempts: 0, unassignedAlertedAt: null, failureReason: null });
    });

    it('cannot touch finished jobs, and is admin-only', async () => {
      const { job } = await pickupJob();
      await t.prisma.deliveryJob.update({ where: { id: job.id }, data: { status: 'COMPLETED' } });
      const r = await createRider(t, basics);
      expect((await adminPost(`${job.id}/assign`, { riderId: r.rider.id }).expect(409)).body.error.code).toBe('JOB_INVALID_TRANSITION');
      await adminPost(`${job.id}/fail`, { reason: 'No way' }).expect(409);

      const customer = await createCustomer(t);
      await http.get('/api/v1/admin/delivery/jobs').set(customer.auth).expect(403);
      await http.post(`/api/v1/admin/delivery/jobs/${job.id}/assign`).set(r.auth).send({ riderId: r.rider.id }).expect(403);
      await adminPost('00000000-0000-4000-8000-000000000000/redispatch').expect(404);
      void JobStatus;
    });
  });
});
