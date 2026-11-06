import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { Reflector } from '@nestjs/core';
import { Queue } from 'bullmq';
import request from 'supertest';
import { RATE_LIMIT_KEY } from '../src/common/rate-limit/rate-limit.decorator';
import { Clock } from '../src/common/time/clock';
import { QUEUES } from '../src/infra/queue/queues';
import { AnonymisationService } from '../src/modules/privacy/anonymisation.service';
import { EXPORT_LIMITS } from '../src/modules/privacy/data-export.service';
import { PrivacyController } from '../src/modules/privacy/privacy.controller';
import { DELETE_MEDIA_ASSET_JOB } from '../src/modules/privacy/privacy.constants';
import { TestApp, Basics, NOW, clearRateLimits, createAddress, createAdmin, createCustomer, createLiveVendor, createTestApp, createUserWithToken, fixedClock, insertOrder, prepareReferenceData } from './helpers';
import { createRider } from './delivery-helpers';

const DAY = 86_400_000;

describe('Account deletion, data export and legal holds (e2e)', () => {
  const clock = fixedClock(NOW);
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let anonymiser: AnonymisationService;
  let media: Queue;

  beforeAll(async () => {
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    anonymiser = t.app.get(AnonymisationService);
    media = t.app.get<Queue>(getQueueToken(QUEUES.MEDIA));
  });

  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
    await media.obliterate({ force: true });
    // runDue() works on every due request in the database, so each test starts without leftovers from the others.
    await t.prisma.accountDeletionRequest.updateMany({ where: { status: 'PENDING' }, data: { status: 'CANCELLED' } });
  });

  afterAll(() => t.close());

  /** Gets a login code sent (the bypass code is 123456) and asks for deletion with it. */
  async function requestDeletion(u: { user: { phone: string }; auth: { Authorization: string } }, code = '123456', extra: object = {}) {
    await http.post('/api/v1/auth/otp/request').send({ phone: u.user.phone }).expect(200);
    return http.post('/api/v1/me/delete-request').set(u.auth).send({ code, ...extra });
  }

  const pendingFor = (userId: string) => t.prisma.accountDeletionRequest.findFirstOrThrow({ where: { userId }, orderBy: { requestedAt: 'desc' } });

  describe('requesting and cancelling', () => {
    it('schedules the deletion, signs everything out and limits the account to the status and cancel endpoints', async () => {
      const c = await createCustomer(t);
      await t.prisma.deviceToken.create({ data: { userId: c.user.id, token: `tok-${randomUUID()}`, platform: 'android' } });
      await t.prisma.session.create({ data: { userId: c.user.id, refreshHash: randomUUID(), expiresAt: new Date(NOW.getTime() + DAY) } });

      const res = await requestDeletion(c, '123456', { reasonCode: 'NOT_USING' }).then((r) => r);
      expect(res.status).toBe(202);
      expect(res.body.data).toMatchObject({ status: 'PENDING', daysLeft: 30, canCancel: true });
      expect(new Date(res.body.data.scheduledFor).getTime()).toBe(NOW.getTime() + 30 * DAY);

      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: c.user.id } });
      expect(user.status).toBe('PENDING_DELETION');
      expect(await t.prisma.deviceToken.count({ where: { userId: c.user.id } })).toBe(0);
      expect(await t.prisma.session.count({ where: { userId: c.user.id, revokedAt: null } })).toBe(0);
      expect((await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCOUNT_DELETION_REQUESTED', entityId: c.user.id } })).actorId).toBe(c.user.id);

      // Everything except the status and cancel endpoints is closed.
      const blocked = await http.get('/api/v1/me').set(c.auth).expect(403);
      expect(blocked.body.error.code).toBe('ACCOUNT_PENDING_DELETION');
      await http.get('/api/v1/orders').set(c.auth).expect(403);
      const status = await http.get('/api/v1/me/delete-request').set(c.auth).expect(200);
      expect(status.body.data).toMatchObject({ status: 'PENDING', canCancel: true });
    });

    it('can be cancelled during the grace period, which restores the account', async () => {
      const c = await createCustomer(t);
      await requestDeletion(c).then((r) => expect(r.status).toBe(202));

      const res = await http.delete('/api/v1/me/delete-request').set(c.auth).expect(200);
      expect(res.body.data).toMatchObject({ status: 'CANCELLED', canCancel: false });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: c.user.id } })).status).toBe('ACTIVE');
      await http.get('/api/v1/me').set(c.auth).expect(200);

      const none = await http.delete('/api/v1/me/delete-request').set(c.auth).expect(404);
      expect(none.body.error.code).toBe('DELETION_NOT_REQUESTED');
      // A cancelled account can ask again later.
      await requestDeletion(c).then((r) => expect(r.status).toBe(202));
    });

    it('does not run for a cancelled request even after its date', async () => {
      const c = await createCustomer(t);
      await requestDeletion(c);
      const req = await pendingFor(c.user.id);
      await http.delete('/api/v1/me/delete-request').set(c.auth).expect(200);
      clock.set(new Date(NOW.getTime() + 40 * DAY));
      expect(await anonymiser.anonymise(req.id)).toMatchObject({ done: false, reason: 'NOT_PENDING' });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: c.user.id } })).phone).toBe(c.user.phone);
    });

    it('needs the phone code, and a wrong code changes nothing', async () => {
      const c = await createCustomer(t);
      await http.post('/api/v1/auth/otp/request').send({ phone: c.user.phone }).expect(200);
      const bad = await http.post('/api/v1/me/delete-request').set(c.auth).send({ code: '000000' }).expect(400);
      expect(bad.body.error.code).toBe('INVALID_OTP');
      await http.post('/api/v1/me/delete-request').set(c.auth).send({}).expect(400);
      await http.post('/api/v1/me/delete-request').set(c.auth).send({ code: '123456', reasonCode: 'free text about me' }).expect(400);
      expect(await t.prisma.accountDeletionRequest.count({ where: { userId: c.user.id } })).toBe(0);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: c.user.id } })).status).toBe('ACTIVE');
    });

    it('is not available to shop staff or admins', async () => {
      const staff = await createUserWithToken(t, 'VENDOR_STAFF');
      const refused = await requestDeletion(staff);
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe('STAFF_REMOVED_BY_OWNER');

      const admin = await createAdmin(t);
      const adminRefused = await http.post('/api/v1/me/delete-request').set(admin.auth).send({ code: '123456' });
      expect(adminRefused.status).toBe(403);
      expect(adminRefused.body.error.code).toBe('DELETION_NOT_AVAILABLE');
    });

    it('rate-limits the privacy endpoints', () => {
      const reflector = new Reflector();
      const limit = (m: keyof PrivacyController) => reflector.get<{ name: string }>(RATE_LIMIT_KEY, PrivacyController.prototype[m] as unknown as () => void)?.name;
      expect([limit('request'), limit('cancel'), limit('export')]).toEqual(['delete-request', 'delete-cancel', 'data-export']);
    });
  });

  describe('blockers', () => {
    it('lists what a customer has to finish first', async () => {
      const v = await createLiveVendor(t, basics);
      const c = await createCustomer(t);
      const order = await insertOrder(t, { vendorId: v.vendor.id, customerId: c.user.id, cityId: basics.cityId, pickupSlotStart: NOW, deliverySlotStart: NOW, status: 'ACCEPTED' });
      await t.prisma.complaint.create({ data: { orderId: order.id, customerId: c.user.id, vendorId: v.vendor.id, type: 'COMPLAINT', subject: 's', description: 'd' } });

      const res = await requestDeletion(c);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DELETION_BLOCKED');
      expect(res.body.error.details.blockers.map((b: { code: string }) => b.code).sort()).toEqual(['ACTIVE_ORDERS', 'OPEN_COMPLAINTS']);
      expect(await t.prisma.accountDeletionRequest.count({ where: { userId: c.user.id } })).toBe(0);

      await t.prisma.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
      await t.prisma.complaint.updateMany({ where: { customerId: c.user.id }, data: { status: 'RESOLVED' } });
      expect((await requestDeletion(c)).status).toBe(202);
    });

    it('stops a shop owner with money owed or a payout in progress', async () => {
      const v = await createLiveVendor(t, basics);
      const order = await insertOrder(t, { vendorId: v.vendor.id, customerId: (await createCustomer(t)).user.id, cityId: basics.cityId, pickupSlotStart: NOW, deliverySlotStart: NOW, status: 'DELIVERED' });
      await t.prisma.ledgerEntry.create({ data: { vendorId: v.vendor.id, orderId: order.id, type: 'ORDER_EARNING', amount: 85 } });

      const owed = await requestDeletion(v.owner);
      expect(owed.status).toBe(409);
      expect(owed.body.error.details.blockers.map((b: { code: string }) => b.code)).toContain('VENDOR_BALANCE');

      const payout = await t.prisma.payout.create({ data: { vendorId: v.vendor.id, amount: 85, method: 'BANK', accountRef: 'PK36SCBL0000001123456702', status: 'REQUESTED' } });
      await t.prisma.ledgerEntry.create({ data: { vendorId: v.vendor.id, payoutId: payout.id, type: 'PAYOUT', amount: -85 } });
      await t.prisma.payout.update({ where: { id: payout.id }, data: { status: 'APPROVED' } });
      const inProgress = await requestDeletion(v.owner);
      expect(inProgress.body.error.details.blockers.map((b: { code: string }) => b.code)).toContain('PAYOUTS_IN_PROGRESS');

      await t.prisma.payout.update({ where: { id: payout.id }, data: { status: 'PAID' } });
      expect((await requestDeletion(v.owner)).status).toBe(202);
    });

    it('stops a rider holding cash or in the middle of a delivery', async () => {
      const v = await createLiveVendor(t, basics);
      const rider = await createRider(t, basics);
      const customer = await createCustomer(t);
      const order = await insertOrder(t, { vendorId: v.vendor.id, customerId: customer.user.id, cityId: basics.cityId, pickupSlotStart: NOW, deliverySlotStart: NOW, status: 'OUT_FOR_DELIVERY' });
      const job = await t.prisma.deliveryJob.create({ data: { orderId: order.id, jobType: 'DROP', status: 'IN_TRANSIT', riderId: rider.rider.id, scheduledStart: NOW, scheduledEnd: NOW } });
      await t.prisma.codCollection.create({ data: { orderId: order.id, riderId: rider.rider.id, amount: 350 } });

      const res = await requestDeletion(rider);
      expect(res.status).toBe(409);
      expect(res.body.error.details.blockers.map((b: { code: string }) => b.code).sort()).toEqual(['ACTIVE_DELIVERY_JOBS', 'UNSETTLED_COD_CASH']);

      await t.prisma.deliveryJob.update({ where: { id: job.id }, data: { status: 'COMPLETED' } });
      const settlement = await t.prisma.codSettlement.create({ data: { riderId: rider.rider.id, amount: 350, reference: `S-${randomUUID().slice(0, 6)}`, settledBy: (await createAdmin(t)).user.id } });
      await t.prisma.codCollection.updateMany({ where: { riderId: rider.rider.id }, data: { settlementId: settlement.id } });
      expect((await requestDeletion(rider)).status).toBe(202);
    });
  });

  describe('anonymisation', () => {
    it('removes a customer\'s personal data and keeps what the business and the law need', async () => {
      const v = await createLiveVendor(t, basics);
      const c = await createCustomer(t);
      await t.prisma.user.update({ where: { id: c.user.id }, data: { name: 'Ayesha Khan', email: 'ayesha@example.com' } });
      const address = await createAddress(t, c.user.id, basics.cityId, { lat: 31.52134, lng: 74.35987 });
      const order = await insertOrder(t, { vendorId: v.vendor.id, customerId: c.user.id, cityId: basics.cityId, pickupSlotStart: NOW, deliverySlotStart: NOW, status: 'DELIVERED' });
      await t.prisma.order.update({
        where: { id: order.id },
        data: { addressId: address.id, customerNote: 'Gate code 4421, call Ayesha', addressSnapshot: { label: 'Home', line1: '12 Model Town', line2: 'Block C', area: 'Model Town', cityId: basics.cityId, lat: 31.52134, lng: 74.35987 } },
      });
      await t.prisma.review.create({ data: { orderId: order.id, customerId: c.user.id, targetType: 'VENDOR', vendorId: v.vendor.id, rating: 5, comment: 'Great service' } });
      await t.prisma.complaint.create({
        data: { orderId: order.id, customerId: c.user.id, vendorId: v.vendor.id, type: 'COMPLAINT', status: 'RESOLVED', subject: 'Stain', description: 'A stain remained', attachments: [{ publicId: 'dhoblio/test/complaints/u1/photo1', url: 'https://x/y' }] },
      });
      await t.prisma.notification.create({ data: { userId: c.user.id, channel: 'SMS', template: 'order_placed', payload: { body: 'Hello Ayesha' }, status: 'SENT' } });
      await t.prisma.otpCode.create({ data: { phone: c.user.phone, purpose: 'LOGIN', codeHash: 'h', expiresAt: NOW } });

      expect((await requestDeletion(c)).status).toBe(202);
      const request = await pendingFor(c.user.id);

      // Not yet: still inside the grace period.
      expect(await anonymiser.runDue()).toMatchObject({ due: 0 });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: c.user.id } })).phone).toBe(c.user.phone);

      clock.set(new Date(NOW.getTime() + 31 * DAY));
      const summary = await anonymiser.runDue();
      expect(summary).toMatchObject({ due: 1, completed: 1, failed: 0, deferred: 0 });

      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: c.user.id } });
      expect(user).toMatchObject({ status: 'DELETED', phone: `deleted:${c.user.id}`, email: null, name: 'Deleted user', passwordHash: null, referralCode: null });
      expect(user.deletedAt).not.toBeNull();
      expect(await t.prisma.address.count({ where: { userId: c.user.id } })).toBe(0);
      expect(await t.prisma.notification.count({ where: { userId: c.user.id } })).toBe(0);
      expect(await t.prisma.session.count({ where: { userId: c.user.id } })).toBe(0);
      expect(await t.prisma.otpCode.count({ where: { phone: c.user.phone } })).toBe(0);

      // The order is still there, with its amounts, but nobody can tell where the customer lives any more.
      const kept = await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(kept.total.toString()).toBe('100');
      expect(kept.customerNote).toBeNull();
      expect(kept.addressId).toBeNull();
      expect(kept.addressSnapshot).toEqual({ area: 'Model Town', cityId: basics.cityId, lat: 31.52, lng: 74.36, scrubbed: true });
      expect((await t.prisma.review.findFirstOrThrow({ where: { orderId: order.id } })).comment).toBe('Great service');
      const complaint = await t.prisma.complaint.findFirstOrThrow({ where: { orderId: order.id } });
      expect(complaint.description).toBe('A stain remained');
      expect(complaint.attachments).toBeNull();

      const jobs = await media.getJobs(['waiting', 'delayed', 'active']);
      expect(jobs.map((j) => [j.name, j.data.publicId])).toEqual([[DELETE_MEDIA_ASSET_JOB, 'dhoblio/test/complaints/u1/photo1']]);

      const done = await t.prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: request.id } });
      expect(done.status).toBe('COMPLETED');
      const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'ACCOUNT_ANONYMISED', entityId: c.user.id } });
      const auditText = JSON.stringify(audit);
      for (const secret of ['Ayesha', 'ayesha@example.com', c.user.phone, 'Model Town', 'Gate code']) expect(auditText).not.toContain(secret);
    });

    it('is safe to run again, and frees the phone number for a new sign-up', async () => {
      const c = await createCustomer(t);
      await requestDeletion(c);
      const req = await pendingFor(c.user.id);
      clock.set(new Date(NOW.getTime() + 31 * DAY));
      expect(await anonymiser.anonymise(req.id)).toMatchObject({ done: true });
      expect(await anonymiser.anonymise(req.id)).toMatchObject({ done: false, reason: 'NOT_PENDING' });
      expect(await anonymiser.runDue()).toMatchObject({ due: 0 });
      expect(await t.prisma.auditLog.count({ where: { action: 'ACCOUNT_ANONYMISED', entityId: c.user.id } })).toBe(1);

      // The same number can sign up again as a brand new account.
      await http.post('/api/v1/auth/otp/request').send({ phone: c.user.phone }).expect(200);
      const login = await http.post('/api/v1/auth/otp/verify').set('x-token-transport', 'body').send({ phone: c.user.phone, code: '123456' }).expect(200);
      expect(login.body.data.isNewUser).toBe(true);
      expect(login.body.data.user.id).not.toBe(c.user.id);
    });

    it('removes a shop owner\'s CNIC and documents, closes the shop and masks payout accounts', async () => {
      const v = await createLiveVendor(t, basics);
      const staff = await createUserWithToken(t, 'VENDOR_STAFF');
      await t.prisma.vendorStaff.create({ data: { vendorId: v.vendor.id, userId: staff.user.id } });
      await t.prisma.payout.create({ data: { vendorId: v.vendor.id, amount: 50, method: 'BANK', accountRef: 'PK36SCBL0000001123456702', status: 'PAID', note: 'paid to Mr Ali' } });

      expect((await requestDeletion(v.owner)).status).toBe(202);
      expect((await t.prisma.vendor.findUniqueOrThrow({ where: { id: v.vendor.id } })).availability).toBe('CLOSED');
      clock.set(new Date(NOW.getTime() + 31 * DAY));
      expect(await anonymiser.runDue()).toMatchObject({ completed: 1 });

      const vendor = await t.prisma.vendor.findUniqueOrThrow({ where: { id: v.vendor.id } });
      expect(vendor).toMatchObject({ status: 'SUSPENDED', availability: 'CLOSED', cnicEnc: '', cnicHash: `deleted:${v.vendor.id}`, description: null });
      expect(await t.prisma.vendorDocument.count({ where: { vendorId: v.vendor.id } })).toBe(0);
      expect(await t.prisma.vendorStaff.count({ where: { vendorId: v.vendor.id } })).toBe(0);
      expect(await t.prisma.serviceItem.count({ where: { vendorId: v.vendor.id, isActive: true } })).toBe(0);
      const payout = await t.prisma.payout.findFirstOrThrow({ where: { vendorId: v.vendor.id } });
      expect(payout).toMatchObject({ accountRef: '****6702', note: null });
      const queued = (await media.getJobs(['waiting', 'delayed', 'active'])).map((j) => j.data.publicId).sort();
      const base = `dhoblio/test/vendors/${v.owner.user.id}/docs`;
      expect(queued).toEqual([`${base}/cnic_back`, `${base}/cnic_front`, `${base}/shop_photo`]);
    });

    it('removes a rider\'s CNIC, photo and last known position', async () => {
      const rider = await createRider(t, basics, { name: 'Bilal Ahmed' });
      expect((await requestDeletion(rider)).status).toBe(202);
      expect((await t.prisma.rider.findUniqueOrThrow({ where: { id: rider.rider.id } })).isOnline).toBe(false);
      clock.set(new Date(NOW.getTime() + 31 * DAY));
      await anonymiser.runDue();

      const after = await t.prisma.rider.findUniqueOrThrow({ where: { id: rider.rider.id } });
      expect(after).toMatchObject({ status: 'SUSPENDED', isOnline: false, cnicEnc: '', cnicHash: `deleted:${after.id}`, photoUrl: null, photoPublicId: null, lastLat: null, lastLng: null });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: rider.user.id } })).name).toBe('Deleted user');
      expect((await media.getJobs(['waiting', 'delayed', 'active'])).map((j) => j.data.publicId)).toEqual(['rider']);
    });

    it('waits when something new blocks the deletion, and says why', async () => {
      const v = await createLiveVendor(t, basics);
      const rider = await createRider(t, basics);
      const customer = await createCustomer(t);
      await requestDeletion(rider);
      const order = await insertOrder(t, { vendorId: v.vendor.id, customerId: customer.user.id, cityId: basics.cityId, pickupSlotStart: NOW, deliverySlotStart: NOW, status: 'OUT_FOR_DELIVERY' });
      await t.prisma.deliveryJob.create({ data: { orderId: order.id, jobType: 'DROP', status: 'ASSIGNED', riderId: rider.rider.id, scheduledStart: NOW, scheduledEnd: NOW } });

      clock.set(new Date(NOW.getTime() + 31 * DAY));
      expect(await anonymiser.runDue()).toMatchObject({ due: 1, completed: 0, deferred: 1 });
      const req = await pendingFor(rider.user.id);
      expect(req).toMatchObject({ status: 'PENDING', lastError: 'BLOCKED:ACTIVE_DELIVERY_JOBS', attempts: 1 });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: rider.user.id } })).status).toBe('PENDING_DELETION');
    });
  });

  describe('legal hold and the admin queue', () => {
    it('keeps a held account until the hold is released', async () => {
      const support = await createAdmin(t, 'SUPPORT');
      const c = await createCustomer(t);
      await requestDeletion(c);

      const held = await http.put(`/api/v1/admin/users/${c.user.id}/legal-hold`).set(support.auth).send({ reason: 'Payment dispute case PD-1' }).expect(200);
      expect(held.body.data).toMatchObject({ legalHold: true });

      clock.set(new Date(NOW.getTime() + 31 * DAY));
      expect(await anonymiser.runDue()).toMatchObject({ due: 1, completed: 0, deferred: 1 });
      expect(await pendingFor(c.user.id)).toMatchObject({ status: 'PENDING', lastError: 'LEGAL_HOLD' });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: c.user.id } })).phone).toBe(c.user.phone);

      const list = await http.get('/api/v1/admin/deletion-requests?status=PENDING').set(support.auth).expect(200);
      const row = list.body.data.find((r: { userId: string }) => r.userId === c.user.id);
      expect(row).toMatchObject({ role: 'CUSTOMER', legalHold: true, legalHoldReason: 'Payment dispute case PD-1', lastError: 'LEGAL_HOLD' });
      expect(row.phone).not.toBe(c.user.phone); // masked
      expect(JSON.stringify(row)).not.toContain(c.user.phone);

      await http.delete(`/api/v1/admin/users/${c.user.id}/legal-hold`).set(support.auth).expect(200);
      expect(await anonymiser.runDue()).toMatchObject({ completed: 1 });
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: c.user.id } })).status).toBe('DELETED');
      expect(await t.prisma.auditLog.count({ where: { action: { in: ['USER_LEGAL_HOLD_SET', 'USER_LEGAL_HOLD_CLEARED'] }, entityId: c.user.id } })).toBe(2);
    });

    it('is restricted to the right admins and cannot hold a deleted account', async () => {
      const ops = await createAdmin(t, 'OPERATIONS');
      const c = await createCustomer(t);
      await http.get('/api/v1/admin/deletion-requests').set(ops.auth).expect(403);
      await http.put(`/api/v1/admin/users/${c.user.id}/legal-hold`).set(ops.auth).send({ reason: 'some reason' }).expect(403);
      await http.get('/api/v1/admin/deletion-requests').set(c.auth).expect(403);

      const support = await createAdmin(t, 'SUPPORT');
      await http.put(`/api/v1/admin/users/${c.user.id}/legal-hold`).set(support.auth).send({ reason: 'x' }).expect(400);
      await http.put(`/api/v1/admin/users/${randomUUID()}/legal-hold`).set(support.auth).send({ reason: 'case 12345' }).expect(404);

      await t.prisma.user.update({ where: { id: c.user.id }, data: { status: 'DELETED' } });
      const res = await http.put(`/api/v1/admin/users/${c.user.id}/legal-hold`).set(support.auth).send({ reason: 'case 12345' }).expect(409);
      expect(res.body.error.code).toBe('ALREADY_DELETED');
    });

    it('pages through the queue', async () => {
      const support = await createAdmin(t, 'SUPPORT');
      for (let i = 0; i < 3; i++) {
        const u = await createCustomer(t);
        await t.prisma.accountDeletionRequest.create({ data: { userId: u.user.id, roleAtRequest: 'CUSTOMER', scheduledFor: new Date(NOW.getTime() + DAY), requestedAt: new Date(NOW.getTime() + i * 1000) } });
      }
      const first = await http.get('/api/v1/admin/deletion-requests?limit=2').set(support.auth).expect(200);
      expect(first.body.data).toHaveLength(2);
      expect(first.body.meta.nextCursor).toEqual(expect.any(String));
      const second = await http.get(`/api/v1/admin/deletion-requests?limit=2&cursor=${first.body.meta.nextCursor}`).set(support.auth).expect(200);
      expect(second.body.data.length).toBeGreaterThanOrEqual(1);
      expect(second.body.data.map((r: { id: string }) => r.id)).not.toContain(first.body.data[0].id);
    });
  });

  describe('data export', () => {
    it('gives a customer their own data and never secrets', async () => {
      const v = await createLiveVendor(t, basics);
      const c = await createCustomer(t);
      await t.prisma.user.update({ where: { id: c.user.id }, data: { name: 'Ayesha Khan', email: 'ayesha@example.com' } });
      await createAddress(t, c.user.id, basics.cityId);
      const order = await insertOrder(t, { vendorId: v.vendor.id, customerId: c.user.id, cityId: basics.cityId, pickupSlotStart: NOW, deliverySlotStart: NOW, status: 'DELIVERED' });
      const other = await createCustomer(t);
      await insertOrder(t, { vendorId: v.vendor.id, customerId: other.user.id, cityId: basics.cityId, pickupSlotStart: NOW, deliverySlotStart: NOW, status: 'DELIVERED' });

      const res = await http.get('/api/v1/me/export').set(c.auth).expect(200);
      const data = res.body.data;
      expect(data.account).toMatchObject({ id: c.user.id, name: 'Ayesha Khan', email: 'ayesha@example.com' });
      expect(data.addresses).toHaveLength(1);
      expect(data.orders.map((o: { orderNo: string }) => o.orderNo)).toEqual([order.orderNo]);
      expect(data.truncated).toEqual({ orders: false, reviews: false, complaints: false, notificationLog: false });
      const text = JSON.stringify(data);
      for (const secret of ['passwordHash', 'refreshHash', 'cnicEnc', other.user.phone]) expect(text).not.toContain(secret);
      expect(await t.prisma.auditLog.count({ where: { action: 'DATA_EXPORT_REQUESTED', entityId: c.user.id } })).toBe(1);
    });

    it('shows a shop owner or rider their business data with a masked CNIC', async () => {
      const v = await createLiveVendor(t, basics);
      const ownerExport = (await http.get('/api/v1/me/export').set(v.owner.auth).expect(200)).body.data;
      expect(ownerExport.vendor.cnicMasked).toMatch(/^\*+\d{4}$|\d+\*+\d+/);
      expect(JSON.stringify(ownerExport)).not.toContain('cnicEnc');
      expect(ownerExport.vendor.cnicMasked).not.toContain(v.cnic);

      const rider = await createRider(t, basics);
      const riderExport = (await http.get('/api/v1/me/export').set(rider.auth).expect(200)).body.data;
      expect(riderExport.rider.cnicMasked).not.toContain(rider.cnic);
      expect(JSON.stringify(riderExport)).not.toContain('cnicEnc');
    });

    it('cuts very long lists and says so', async () => {
      const c = await createCustomer(t);
      for (let i = 0; i < 3; i++) await t.prisma.notification.create({ data: { userId: c.user.id, channel: 'SMS', template: 't', payload: {}, status: 'SENT' } });
      const original = EXPORT_LIMITS.notifications;
      (EXPORT_LIMITS as { notifications: number }).notifications = 2;
      try {
        const data = (await http.get('/api/v1/me/export').set(c.auth).expect(200)).body.data;
        expect(data.notificationLog).toHaveLength(2);
        expect(data.truncated.notificationLog).toBe(true);
      } finally {
        (EXPORT_LIMITS as { notifications: number }).notifications = original;
      }
    });
  });
});
