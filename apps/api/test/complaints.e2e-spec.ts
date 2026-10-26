import { JobStatus, JobType, OrderStatus } from '@prisma/client';
import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { CloudinaryService } from '../src/infra/cloudinary/cloudinary.service';
import {
  Basics,
  NOW,
  TestApp,
  clearRateLimits,
  createAdmin,
  createTestApp,
  fakeCloudinary,
  fixedClock,
  prepareReferenceData,
} from './helpers';
import { OrderScenario, anotherCustomer, orderScenario, placeOrder } from './order-helpers';

describe('Complaints and redo (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({
      customize: (b) =>
        b.overrideProvider(Clock).useValue(clock).overrideProvider(CloudinaryService).useValue(fakeCloudinary()),
    });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
  });
  afterAll(() => t.close());

  async function deliveredOrder() {
    const s = await orderScenario(t, basics);
    const order = await placeOrder(http, s);
    await t.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.DELIVERED, deliveredAt: clock.now() } });
    return { ...s, order };
  }

  async function originalJobs(orderId: string) {
    const start = clock.now();
    await t.prisma.deliveryJob.createMany({
      data: [JobType.PICKUP, JobType.DROP].map((jobType) => ({
        orderId,
        jobType,
        attempt: 1,
        status: JobStatus.COMPLETED,
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + 60 * 60_000),
        completedAt: start,
      })),
    });
  }

  const complaintBody = (extra: Record<string, unknown> = {}) => ({
    subject: 'Shirt came back with a mark',
    description: 'The white shirt still has a dark mark on the collar.',
    ...extra,
  });

  function createComplaint(s: OrderScenario, orderId: string, body = complaintBody(), auth = s.customer.auth) {
    return http.post(`/api/v1/orders/${orderId}/complaints`).set(auth).send(body);
  }

  it('lets the owner file one live complaint, lets the vendor reply, and resolves with a redo', async () => {
    const s = await deliveredOrder();
    await originalJobs(s.order.id);
    const publicId = `dhoblio/test/complaints/${s.customer.user.id}/collar`;

    const created = await createComplaint(
      s,
      s.order.id,
      complaintBody({ type: 'REDO', attachments: [{ publicId }] }),
    ).expect(201);
    const complaint = created.body.data;
    expect(complaint).toMatchObject({
      orderId: s.order.id,
      customerId: s.customer.user.id,
      vendorId: s.vendor.vendor.id,
      type: 'REDO',
      status: 'OPEN',
      order: { orderNo: s.order.orderNo },
      vendor: { businessName: s.vendor.vendor.businessName },
    });
    expect(complaint.attachments).toEqual([
      { publicId, url: `https://res.cloudinary.com/demo/image/authenticated/v1/${publicId}.jpg`, format: 'jpg', signedUrl: expect.stringContaining(publicId) },
    ]);

    const again = await createComplaint(s, s.order.id).expect(409);
    expect(again.body.error.code).toBe('COMPLAINT_OPEN');
    expect(again.body.error.details.complaintId).toBe(complaint.id);

    const other = await anotherCustomer(t, basics, s);
    const stranger = await createComplaint(other, s.order.id).expect(404);
    expect(stranger.body.error.code).toBe('NOT_FOUND');

    const inbox = await http.get('/api/v1/vendor/complaints').set(s.vendor.owner.auth).expect(200);
    expect(inbox.body.data.map((c: { id: string }) => c.id)).toContain(complaint.id);

    const foreignVendor = await orderScenario(t, basics);
    await http.get(`/api/v1/vendor/complaints/${complaint.id}`).set(foreignVendor.vendor.owner.auth).expect(404);

    const replied = await http
      .post(`/api/v1/vendor/complaints/${complaint.id}/reply`)
      .set(s.vendor.owner.auth)
      .send({ body: 'Sorry about that. We can clean the shirt again at no charge.' })
      .expect(201);
    expect(replied.body.data).toMatchObject({ status: 'VENDOR_RESPONDED' });
    expect(replied.body.data.messages).toEqual([
      expect.objectContaining({ authorRole: 'VENDOR_OWNER', body: 'Sorry about that. We can clean the shirt again at no charge.' }),
    ]);

    const assigned = await http
      .post(`/api/v1/admin/complaints/${complaint.id}/assign`)
      .set(admin.auth)
      .send({})
      .expect(200);
    expect(assigned.body.data).toMatchObject({ status: 'IN_REVIEW', assignedToId: admin.user.id });

    const resolved = await http
      .post(`/api/v1/admin/complaints/${complaint.id}/resolve`)
      .set(admin.auth)
      .send({ outcome: 'REDO', note: 'We will reclean it.' })
      .expect(200);
    expect(resolved.body.data).toMatchObject({
      status: 'RESOLVED',
      resolution: 'REDO: We will reclean it.',
      refunded: 0,
      redoJobIds: expect.arrayContaining([expect.any(String)]),
    });
    expect(resolved.body.data.redoJobIds).toHaveLength(2);
    expect(resolved.body.data.messages.map((m: { body: string }) => m.body)).toContain('Resolution: We will reclean it.');

    const redoJobs = await t.prisma.deliveryJob.findMany({ where: { orderId: s.order.id, attempt: 2 }, orderBy: { jobType: 'asc' } });
    expect(redoJobs).toHaveLength(2);
    expect(redoJobs.every((j) => j.isRedo && j.status === JobStatus.UNASSIGNED)).toBe(true);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: s.order.id } })).status).toBe(OrderStatus.DELIVERED);

    const closed = await http
      .post(`/api/v1/orders/${s.order.id}/complaints/${complaint.id}/messages`)
      .set(s.customer.auth)
      .send({ body: 'Any update?' })
      .expect(409);
    expect(closed.body.error.code).toBe('COMPLAINT_CLOSED');
    await http
      .post(`/api/v1/admin/complaints/${complaint.id}/resolve`)
      .set(admin.auth)
      .send({ outcome: 'REJECT' })
      .expect(409);
  });

  it('records a COD refund without calling a gateway', async () => {
    const s = await deliveredOrder();
    const complaint = (await createComplaint(s, s.order.id).expect(201)).body.data;

    const resolved = await http
      .post(`/api/v1/admin/complaints/${complaint.id}/resolve`)
      .set(admin.auth)
      .send({ outcome: 'REFUND', note: 'Cash returned to the customer.' })
      .expect(200);
    expect(resolved.body.data).toMatchObject({
      status: 'RESOLVED',
      resolution: 'REFUND: Cash returned to the customer.',
      refunded: 0,
      redoJobIds: [],
    });
    expect(await t.prisma.deliveryJob.count({ where: { orderId: s.order.id } })).toBe(0);
  });

  it('rejects missing or foreign photos and complaints on undelivered orders', async () => {
    const s = await deliveredOrder();
    const outside = await createComplaint(
      s,
      s.order.id,
      complaintBody({ attachments: [{ publicId: 'dhoblio/test/complaints/someone-else/photo' }] }),
    ).expect(400);
    expect(outside.body.error.code).toBe('MEDIA_INVALID_ASSET');

    const duplicate = `dhoblio/test/complaints/${s.customer.user.id}/photo`;
    const twice = await createComplaint(
      s,
      s.order.id,
      complaintBody({ attachments: [{ publicId: duplicate }, { publicId: duplicate }] }),
    ).expect(400);
    expect(twice.body.error.code).toBe('INVALID_ATTACHMENTS');

    const pending = await orderScenario(t, basics);
    const placed = await placeOrder(http, pending);
    const early = await createComplaint(pending, placed.id).expect(409);
    expect(early.body.error.code).toBe('COMPLAINT_NOT_ALLOWED');
  });

  it('lists complaints with cursor pagination and status filters for admins', async () => {
    const s = await deliveredOrder();
    const complaint = (await createComplaint(s, s.order.id).expect(201)).body.data;

    const page = await http
      .get(`/api/v1/admin/complaints?vendorId=${s.vendor.vendor.id}&status=OPEN&limit=1`)
      .set(admin.auth)
      .expect(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.data[0].id).toBe(complaint.id);

    const mine = await http.get(`/api/v1/orders/${s.order.id}/complaints`).set(s.customer.auth).expect(200);
    expect(mine.body.data.map((c: { id: string }) => c.id)).toContain(complaint.id);
  });
});
