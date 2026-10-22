import { getQueueToken } from '@nestjs/bullmq';
import { JobStatus, RiderStatus, Role } from '@prisma/client';
import request from 'supertest';
import { CloudinaryService, uploadFolder } from '../src/infra/cloudinary/cloudinary.service';
import { QUEUES } from '../src/infra/queue/queues';
import { RiderPresenceService } from '../src/modules/delivery/rider-presence.service';
import { createRider } from './delivery-helpers';
import {
  Basics,
  TestApp,
  clearRateLimits,
  createAdmin,
  createCustomer,
  createLiveVendor,
  createTestApp,
  createUserWithToken,
  fakeCloudinary,
  prepareReferenceData,
  randomCnic,
} from './helpers';

describe('Rider registration, review and availability (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  const notifications = { add: jest.fn() };

  beforeAll(async () => {
    t = await createTestApp({
      customize: (b) =>
        b
          .overrideProvider(CloudinaryService)
          .useValue(fakeCloudinary())
          .overrideProvider(getQueueToken(QUEUES.NOTIFICATIONS))
          .useValue(notifications),
    });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
  });
  beforeEach(async () => {
    notifications.add.mockClear();
    await clearRateLimits(t.redis);
  });
  afterAll(() => t.close());

  const photoFor = (userId: string) => `${uploadFolder('test', 'rider', userId)}/face`;
  const body = (userId: string, extra: Record<string, unknown> = {}) => ({
    name: 'Bilal Ahmed',
    cnic: randomCnic(),
    cityId: basics.cityId,
    photoPublicId: photoFor(userId),
    ...extra,
  });
  const newRider = () => createUserWithToken(t, Role.RIDER);
  const register = (u: Awaited<ReturnType<typeof newRider>>, extra: Record<string, unknown> = {}) =>
    http.post('/api/v1/rider/register').set(u.auth).send(body(u.user.id, extra));

  describe('registration', () => {
    it('creates a PENDING rider, stores the CNIC encrypted and the name on the user, and writes an audit entry', async () => {
      const u = await newRider();
      const cnic = '3520112345671';
      const res = await register(u, { cnic: '35201-1234567-1' }).expect(201);
      expect(res.body.data).toMatchObject({ status: 'PENDING', cityId: basics.cityId });

      const row = await t.prisma.rider.findUniqueOrThrow({ where: { userId: u.user.id } });
      expect(row.cnicEnc).not.toContain(cnic);
      expect(row.cnicHash).not.toContain(cnic);
      expect(row.photoUrl).toContain(photoFor(u.user.id));
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: u.user.id } })).name).toBe('Bilal Ahmed');
      expect(await t.prisma.auditLog.count({ where: { action: 'RIDER_REGISTERED', entityId: row.id } })).toBe(1);
    });

    it('refuses a second registration, a duplicate CNIC, a bad CNIC, an unknown city and someone else’s photo', async () => {
      const u = await newRider();
      const cnic = randomCnic();
      await register(u, { cnic }).expect(201);
      await register(u).expect(409);

      const other = await newRider();
      const dup = await register(other, { cnic }).expect(409);
      expect(dup.body.error.code).toBe('DUPLICATE_CNIC');

      await register(await newRider(), { cnic: '123' }).expect(400);
      await register(await newRider(), { cnic: '1111111111111' }).expect(400);
      const noCity = await register(await newRider(), { cityId: 99999 }).expect(400);
      expect(noCity.body.error.code).toBe('CITY_NOT_AVAILABLE');

      const thief = await newRider();
      const stolen = await http.post('/api/v1/rider/register').set(thief.auth).send(body(thief.user.id, { photoPublicId: photoFor(u.user.id) })).expect(400);
      expect(stolen.body.error.code).toBe('MEDIA_INVALID_ASSET');
    });

    it('is for riders only', async () => {
      const customer = await createCustomer(t);
      await http.post('/api/v1/rider/register').set(customer.auth).send(body(customer.user.id)).expect(403);
      await http.post('/api/v1/rider/register').send({}).expect(401);
    });

    it('rejects unknown fields and short names', async () => {
      const u = await newRider();
      await http.post('/api/v1/rider/register').set(u.auth).send({ ...body(u.user.id), status: 'APPROVED' }).expect(400);
      await register(u, { name: 'B' }).expect(400);
    });
  });

  describe('admin review', () => {
    const pendingRider = async () => {
      const u = await newRider();
      const res = await register(u).expect(201);
      return { ...u, riderId: res.body.data.id as string };
    };
    const act = (riderId: string, action: string, payload: object = {}) => http.post(`/api/v1/admin/riders/${riderId}/${action}`).set(admin.auth).send(payload);

    it('a pending rider can see their status but cannot work yet', async () => {
      const r = await pendingRider();
      const status = await http.get('/api/v1/rider/status').set(r.auth).expect(200);
      expect(status.body.data.status).toBe('PENDING');
      const blocked = await http.post('/api/v1/rider/online').set(r.auth).send({ lat: 31.5, lng: 74.3 }).expect(403);
      expect(blocked.body.error.code).toBe('RIDER_NOT_ACTIVE');
      await http.get('/api/v1/rider/jobs/available').set(r.auth).expect(403);
      await http.get('/api/v1/rider/me').set(r.auth).expect(403);
    });

    it('lists applications oldest first, shows detail with the CNIC masked, and reveals it only with an audit entry', async () => {
      const r = await pendingRider();
      const list = await http.get('/api/v1/admin/riders?status=PENDING').set(admin.auth).expect(200);
      expect(list.body.data.map((x: { id: string }) => x.id)).toContain(r.riderId);

      const detail = await http.get(`/api/v1/admin/riders/${r.riderId}`).set(admin.auth).expect(200);
      expect(detail.body.data.cnicMasked).toMatch(/^\*+\d{4}$/);
      expect(JSON.stringify(detail.body)).not.toContain('cnicEnc');
      expect(JSON.stringify(detail.body)).not.toContain('cnicHash');

      const cnic = await http.get(`/api/v1/admin/riders/${r.riderId}/cnic`).set(admin.auth).expect(200);
      expect(cnic.body.data.cnic).toMatch(/^\d{5}-\d{7}-\d$/);
      expect(await t.prisma.auditLog.count({ where: { action: 'RIDER_CNIC_VIEWED', entityId: r.riderId } })).toBe(1);
    });

    it('approve -> rider can work; approving again conflicts; the decision is audited and texted to the rider', async () => {
      const r = await pendingRider();
      const approved = await act(r.riderId, 'approve').expect(200);
      expect(approved.body.data.status).toBe('APPROVED');
      expect(await act(r.riderId, 'approve').expect(409)).toBeTruthy();
      expect(await t.prisma.auditLog.count({ where: { action: 'RIDER_APPROVED', entityId: r.riderId } })).toBe(1);
      expect(notifications.add).toHaveBeenCalledWith('send-sms', expect.objectContaining({ to: r.user.phone, message: expect.stringContaining('approved') }));

      const me = await http.get('/api/v1/rider/me').set(r.auth).expect(200);
      expect(me.body.data).toMatchObject({ status: 'APPROVED', name: 'Bilal Ahmed', isOnline: false, activeJobs: 0 });
    });

    it('reject needs a reason, then the rider can fix details and re-submit', async () => {
      const r = await pendingRider();
      await act(r.riderId, 'reject', {}).expect(400);
      const rejected = await act(r.riderId, 'reject', { reason: 'Photo is blurry' }).expect(200);
      expect(rejected.body.data).toMatchObject({ status: 'REJECTED', rejectionReason: 'Photo is blurry' });

      const status = await http.get('/api/v1/rider/status').set(r.auth).expect(200);
      expect(status.body.data.rejectionReason).toBe('Photo is blurry');

      const again = await register(r).expect(201);
      expect(again.body.data.id).toBe(r.riderId);
      expect(again.body.data.status).toBe('PENDING');
      expect((await t.prisma.rider.findUniqueOrThrow({ where: { id: r.riderId } })).rejectionReason).toBeNull();
    });

    it('suspending takes the rider offline, out of the search, and gives back their unstarted jobs', async () => {
      const r = await createRider(t, basics, { lat: 31.52, lng: 74.35 });
      const order = await t.prisma.order.create({
        data: {
          orderNo: `T-${Date.now()}`,
          customerId: (await createCustomer(t)).user.id,
          vendorId: (await createLiveVendor(t, basics)).vendor.id,
          cityId: basics.cityId,
          addressSnapshot: { lat: 31.52, lng: 74.35 },
          status: 'ACCEPTED',
          pickupSlotStart: new Date(), pickupSlotEnd: new Date(), deliverySlotStart: new Date(), deliverySlotEnd: new Date(),
          subtotal: 100, total: 100, commissionRatePct: 15, commissionAmount: 15, vendorEarning: 85,
          paymentMethod: 'COD', vendorRespondBy: new Date(),
        },
      });
      const job = await t.prisma.deliveryJob.create({
        data: { orderId: order.id, jobType: 'PICKUP', status: 'ACCEPTED', riderId: r.rider.id, scheduledStart: new Date(), scheduledEnd: new Date() },
      });
      expect((await t.app.get(RiderPresenceService).nearby(basics.cityId, 31.52, 74.35, 5)).map((n) => n.riderId)).toContain(r.rider.id);

      await act(r.rider.id, 'suspend', { reason: 'Complaints' }).expect(200);

      const after = await t.prisma.rider.findUniqueOrThrow({ where: { id: r.rider.id } });
      expect(after).toMatchObject({ status: RiderStatus.SUSPENDED, isOnline: false });
      expect((await t.app.get(RiderPresenceService).nearby(basics.cityId, 31.52, 74.35, 5)).map((n) => n.riderId)).not.toContain(r.rider.id);
      const released = await t.prisma.deliveryJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(released).toMatchObject({ status: JobStatus.UNASSIGNED, riderId: null });
      expect(released.declinedRiderIds).toContain(r.rider.id);
      await http.post('/api/v1/rider/online').set(r.auth).send({ lat: 31.5, lng: 74.3 }).expect(403);

      await act(r.rider.id, 'reactivate').expect(200);
      expect((await t.prisma.rider.findUniqueOrThrow({ where: { id: r.rider.id } })).isOnline).toBe(false);
    });

    it('only admins can review, and unknown riders are 404', async () => {
      const r = await pendingRider();
      const customer = await createCustomer(t);
      await http.get('/api/v1/admin/riders').set(customer.auth).expect(403);
      await http.post(`/api/v1/admin/riders/${r.riderId}/approve`).set(r.auth).expect(403);
      await act('00000000-0000-4000-8000-000000000000', 'approve').expect(404);
      await http.get('/api/v1/admin/riders/not-a-uuid').set(admin.auth).expect(400);
    });
  });

  describe('availability and location', () => {
    it('going online needs a position inside Pakistan; pings keep the rider findable; offline removes them', async () => {
      const r = await createRider(t, basics, { online: false });
      await http.post('/api/v1/rider/online').set(r.auth).send({}).expect(400);
      await http.post('/api/v1/rider/online').set(r.auth).send({ lat: 51.5, lng: -0.12 }).expect(400);
      await http.post('/api/v1/rider/location').set(r.auth).send({ lat: 31.5, lng: 74.3 }).expect(409); // still offline

      await http.post('/api/v1/rider/online').set(r.auth).send({ lat: 31.52, lng: 74.35 }).expect(200);
      const presence = t.app.get(RiderPresenceService);
      expect((await presence.nearby(basics.cityId, 31.52, 74.35, 2)).map((n) => n.riderId)).toContain(r.rider.id);

      await http.post('/api/v1/rider/location').set(r.auth).send({ lat: 31.6, lng: 74.4 }).expect(200);
      expect(await presence.position(r.rider.id)).toMatchObject({ lat: 31.6, lng: 74.4 });
      expect((await presence.nearby(basics.cityId, 31.52, 74.35, 2)).map((n) => n.riderId)).not.toContain(r.rider.id);
      expect((await presence.nearby(basics.cityId, 31.6, 74.4, 2))[0]).toMatchObject({ riderId: r.rider.id });

      await http.post('/api/v1/rider/offline').set(r.auth).expect(200);
      expect((await t.prisma.rider.findUniqueOrThrow({ where: { id: r.rider.id } })).isOnline).toBe(false);
      expect(await presence.nearby(basics.cityId, 31.6, 74.4, 2)).toEqual([]);
    });

    it('a rider who stops pinging stops being found once the heartbeat lapses', async () => {
      const r = await createRider(t, basics, { lat: 31.7, lng: 74.5 });
      const presence = t.app.get(RiderPresenceService);
      expect(await presence.nearby(basics.cityId, 31.7, 74.5, 2)).toHaveLength(1);
      await t.redis.del(`rider:beat:${r.rider.id}`); // what the TTL does after RIDER_HEARTBEAT_TTL_SEC
      expect(await presence.nearby(basics.cityId, 31.7, 74.5, 2)).toEqual([]);
      expect(await t.redis.zscore(`rider:geo:${basics.cityId}`, r.rider.id)).toBeNull(); // tidied away
    });
  });
});
