import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Clock } from '../src/common/time/clock';
import { QUEUES } from '../src/infra/queue/queues';
import { RetentionService } from '../src/modules/ops/retention.service';
import { Basics, NOW, createCustomer, createLiveVendor, createTestApp, fixedClock, insertOrder, prepareReferenceData, TestApp } from './helpers';
import { createRider } from './delivery-helpers';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const SNAPSHOT = { label: 'Home', line1: '12 Model Town', line2: 'Block C', area: 'Model Town', cityId: 1, lat: 31.52134, lng: 74.35987 };

describe('Retention: order details, rejected applications, legal windows (e2e)', () => {
  const clock = fixedClock(NOW);
  let t: TestApp;
  let retention: RetentionService;
  let basics: Basics;
  let media: Queue;

  beforeAll(async () => {
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    retention = t.app.get(RetentionService);
    basics = await prepareReferenceData(t);
    media = t.app.get<Queue>(getQueueToken(QUEUES.MEDIA));
  });
  beforeEach(async () => {
    await media.obliterate({ force: true });
  });
  afterAll(() => t.close());

  async function oldOrder(opts: { customerId: string; vendorId: string; ageDays: number; status?: 'DELIVERED' | 'PLACED' | 'CANCELLED' }) {
    const order = await insertOrder(t, { vendorId: opts.vendorId, customerId: opts.customerId, cityId: basics.cityId, pickupSlotStart: daysAgo(opts.ageDays), deliverySlotStart: daysAgo(opts.ageDays), status: opts.status ?? 'DELIVERED' });
    await t.prisma.order.update({ where: { id: order.id }, data: { createdAt: daysAgo(opts.ageDays), customerNote: 'Gate code 4421', addressSnapshot: { ...SNAPSHOT, cityId: basics.cityId } } });
    return order;
  }

  describe('delivery address and note on old orders', () => {
    it('blanks them once the order is old enough, and keeps the amounts', async () => {
      const v = await createLiveVendor(t, basics);
      const c = await createCustomer(t);
      const old = await oldOrder({ customerId: c.user.id, vendorId: v.vendor.id, ageDays: 800 });
      const recent = await oldOrder({ customerId: c.user.id, vendorId: v.vendor.id, ageDays: 100 });
      const unfinished = await oldOrder({ customerId: c.user.id, vendorId: v.vendor.id, ageDays: 900, status: 'PLACED' });

      const result = await retention.purge();
      expect(result.dryRun).toBe(false);
      expect(result.orderPii).toBeGreaterThanOrEqual(1);

      const after = await t.prisma.order.findUniqueOrThrow({ where: { id: old.id } });
      expect(after.customerNote).toBeNull();
      expect(after.addressSnapshot).toEqual({ area: 'Model Town', cityId: basics.cityId, lat: 31.52, lng: 74.36, scrubbed: true });
      expect(after.total.toString()).toBe('100');
      expect(after.vendorEarning.toString()).toBe('85');

      const keptRecent = await t.prisma.order.findUniqueOrThrow({ where: { id: recent.id } });
      expect(keptRecent.customerNote).toBe('Gate code 4421');
      expect(keptRecent.addressSnapshot).toMatchObject({ line1: '12 Model Town' });
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: unfinished.id } })).customerNote).toBe('Gate code 4421');

      // Repeatable.
      expect(await retention.blankOldOrderDetails(false)).toBe(0);
    });

    it('leaves orders with an open complaint and orders of a customer under legal hold alone', async () => {
      const v = await createLiveVendor(t, basics);
      const disputed = await createCustomer(t);
      const held = await createCustomer(t);
      const o1 = await oldOrder({ customerId: disputed.user.id, vendorId: v.vendor.id, ageDays: 800 });
      const o2 = await oldOrder({ customerId: held.user.id, vendorId: v.vendor.id, ageDays: 800 });
      await t.prisma.complaint.create({ data: { orderId: o1.id, customerId: disputed.user.id, vendorId: v.vendor.id, type: 'COMPLAINT', subject: 's', description: 'd' } });
      await t.prisma.user.update({ where: { id: held.user.id }, data: { legalHoldAt: NOW, legalHoldReason: 'case 1' } });

      await retention.purge();
      for (const o of [o1, o2]) expect((await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).customerNote).toBe('Gate code 4421');

      // Once the complaint is closed the order is cleaned on the next run.
      await t.prisma.complaint.updateMany({ where: { orderId: o1.id }, data: { status: 'RESOLVED' } });
      await retention.purge();
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: o1.id } })).customerNote).toBeNull();
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: o2.id } })).customerNote).toBe('Gate code 4421');
    });

    it('only counts in a dry run', async () => {
      const v = await createLiveVendor(t, basics);
      const c = await createCustomer(t);
      const old = await oldOrder({ customerId: c.user.id, vendorId: v.vendor.id, ageDays: 800 });
      expect(await retention.blankOldOrderDetails(true)).toBeGreaterThanOrEqual(1);
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: old.id } })).customerNote).toBe('Gate code 4421');
      expect(await retention.blankOldOrderDetails(false)).toBeGreaterThanOrEqual(1);
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: old.id } })).customerNote).toBeNull();
    });
  });

  describe('rejected applications', () => {
    const makeOld = (table: 'Vendor' | 'Rider', id: string, ageDays: number) =>
      t.prisma.$executeRawUnsafe(`UPDATE "${table}" SET "updatedAt" = $1 WHERE "id" = $2::uuid`, daysAgo(ageDays), id);

    it('deletes CNIC data and documents of old rejected vendors and riders, and nothing else', async () => {
      const rejectedOld = await createLiveVendor(t, basics, { status: 'REJECTED' });
      const rejectedRecent = await createLiveVendor(t, basics, { status: 'REJECTED' });
      const approved = await createLiveVendor(t, basics);
      const held = await createLiveVendor(t, basics, { status: 'REJECTED' });
      await t.prisma.user.update({ where: { id: held.owner.user.id }, data: { legalHoldAt: NOW } });
      await makeOld('Vendor', rejectedOld.vendor.id, 120);
      await makeOld('Vendor', approved.vendor.id, 400);
      await makeOld('Vendor', held.vendor.id, 120);
      await makeOld('Vendor', rejectedRecent.vendor.id, 10);
      const rider = await createRider(t, basics, { status: 'REJECTED' });
      await makeOld('Rider', rider.rider.id, 200);

      expect(await retention.deleteRejectedApplicationData(true)).toBeGreaterThanOrEqual(2);
      expect((await t.prisma.vendor.findUniqueOrThrow({ where: { id: rejectedOld.vendor.id } })).cnicEnc).not.toBe('');

      expect((await retention.purge()).rejectedApplications).toBeGreaterThanOrEqual(2);

      const gone = await t.prisma.vendor.findUniqueOrThrow({ where: { id: rejectedOld.vendor.id } });
      expect(gone).toMatchObject({ cnicEnc: '', cnicHash: `deleted:${rejectedOld.vendor.id}`, status: 'REJECTED' });
      expect(await t.prisma.vendorDocument.count({ where: { vendorId: rejectedOld.vendor.id } })).toBe(0);
      const riderAfter = await t.prisma.rider.findUniqueOrThrow({ where: { id: rider.rider.id } });
      expect(riderAfter).toMatchObject({ cnicEnc: '', photoUrl: null, photoPublicId: null });

      for (const kept of [rejectedRecent, approved, held]) {
        expect((await t.prisma.vendor.findUniqueOrThrow({ where: { id: kept.vendor.id } })).cnicEnc).not.toBe('');
        expect(await t.prisma.vendorDocument.count({ where: { vendorId: kept.vendor.id } })).toBe(3);
      }

      const queued = (await media.getJobs(['waiting', 'delayed', 'active'])).map((j) => j.data.publicId as string);
      expect(queued).toEqual(expect.arrayContaining([`dhoblio/test/vendors/${rejectedOld.owner.user.id}/docs/cnic_front`, 'rider']));
      expect(queued.some((id) => id.includes(approved.owner.user.id))).toBe(false);

      // Repeatable: already-cleaned applications are not processed again.
      const again = await retention.deleteRejectedApplicationData(true);
      expect(again).toBe(0);
    });
  });

  describe('records the law may require', () => {
    it('are reported once past their window and never deleted by the job', async () => {
      const v = await createLiveVendor(t, basics);
      const c = await createCustomer(t);
      const ancient = await oldOrder({ customerId: c.user.id, vendorId: v.vendor.id, ageDays: 9 * 365 });
      await t.prisma.auditLog.create({ data: { action: 'OLD_TEST_EVENT', entity: 'Test', entityId: 'x', createdAt: daysAgo(8 * 365) } });

      const before = await retention.pastWindow();
      expect(before.financialOrders).toBeGreaterThanOrEqual(1);
      expect(before.auditLogs).toBeGreaterThanOrEqual(1);

      const result = await retention.purge();
      expect(result.pastWindow.financialOrders).toBeGreaterThanOrEqual(1);
      expect(await t.prisma.order.count({ where: { id: ancient.id } })).toBe(1);
      expect(await t.prisma.auditLog.count({ where: { action: 'OLD_TEST_EVENT' } })).toBeGreaterThanOrEqual(1);
    });
  });
});
