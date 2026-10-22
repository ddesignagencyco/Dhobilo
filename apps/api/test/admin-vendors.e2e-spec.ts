import { getQueueToken } from '@nestjs/bullmq';
import { Role, VendorStatus } from '@prisma/client';
import request from 'supertest';
import { FieldCrypto } from '../src/common/crypto/field-crypto';
import { CloudinaryService } from '../src/infra/cloudinary/cloudinary.service';
import { QUEUES } from '../src/infra/queue/queues';
import {
  TestApp,
  clearRateLimits,
  createAdmin,
  createTestApp,
  createUserWithToken,
  createVendorFixture,
  ensureCatalogBasics,
  fakeCloudinary,
} from './helpers';

describe('Admin vendor review (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let cityId: number;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  const queueAdd = jest.fn();

  beforeAll(async () => {
    t = await createTestApp({
      customize: (b) =>
        b
          .overrideProvider(CloudinaryService)
          .useValue(fakeCloudinary())
          .overrideProvider(getQueueToken(QUEUES.NOTIFICATIONS))
          .useValue({ add: queueAdd }),
    });
    http = request(t.app.getHttpServer());
    ({ cityId } = await ensureCatalogBasics(t));
    admin = await createAdmin(t);
  });
  beforeEach(async () => {
    queueAdd.mockReset().mockResolvedValue(undefined);
    await clearRateLimits(t.redis);
  });
  afterAll(() => t.close());

  const auditActions = async (vendorId: string) =>
    (await t.prisma.auditLog.findMany({ where: { entity: 'Vendor', entityId: vendorId }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);

  describe('access', () => {
    it('requires authentication and the ADMIN role for every route', async () => {
      const { vendor } = await createVendorFixture(t, cityId, { status: VendorStatus.PENDING });
      const routes: [string, string][] = [
        ['get', '/api/v1/admin/vendors'],
        ['get', `/api/v1/admin/vendors/${vendor.id}`],
        ['get', `/api/v1/admin/vendors/${vendor.id}/cnic`],
        ['post', `/api/v1/admin/vendors/${vendor.id}/approve`],
        ['post', `/api/v1/admin/vendors/${vendor.id}/reject`],
        ['post', `/api/v1/admin/vendors/${vendor.id}/suspend`],
        ['post', `/api/v1/admin/vendors/${vendor.id}/reactivate`],
      ];
      for (const role of [Role.CUSTOMER, Role.VENDOR_OWNER, Role.VENDOR_STAFF, Role.RIDER]) {
        const { auth } = await createUserWithToken(t, role);
        for (const [method, url] of routes) {
          await (http as never as Record<string, (u: string) => request.Test>)[method](url).set(auth).send({ reason: 'whatever it is' }).expect(403);
        }
      }
      for (const [method, url] of routes) await (http as never as Record<string, (u: string) => request.Test>)[method](url).expect(401);
      expect((await t.prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).status).toBe('PENDING');
    });
  });

  describe('review queue', () => {
    it('lists oldest first with filters and cursor pagination', async () => {
      const q = `queue-${Date.now()}`;
      const base = Date.now() - 10 * 60_000;
      const created = [];
      for (let i = 0; i < 5; i++) {
        created.push(
          await createVendorFixture(t, cityId, {
            status: i < 4 ? VendorStatus.PENDING : VendorStatus.APPROVED,
            name: `${q} Laundry ${i}`,
            createdAt: new Date(base + i * 60_000),
          }),
        );
      }
      const ids = created.map((c) => c.vendor.id);

      const page1 = await http.get(`/api/v1/admin/vendors?q=${q.toUpperCase()}&status=PENDING&limit=3`).set(admin.auth).expect(200);
      expect(page1.body.data.map((v: { id: string }) => v.id)).toEqual(ids.slice(0, 3));
      expect(page1.body.meta.nextCursor).toEqual(expect.any(String));
      expect(page1.body.data[0]).toMatchObject({ status: 'PENDING', cityId, owner: { phone: created[0].owner.user.phone } });
      expect(page1.body.data[0]._count.documents).toBe(3);

      const page2 = await http
        .get(`/api/v1/admin/vendors?q=${q}&status=PENDING&limit=3&cursor=${encodeURIComponent(page1.body.meta.nextCursor)}`)
        .set(admin.auth)
        .expect(200);
      expect(page2.body.data.map((v: { id: string }) => v.id)).toEqual([ids[3]]);
      expect(page2.body.meta.nextCursor).toBeNull();

      const all = await http.get(`/api/v1/admin/vendors?q=${q}`).set(admin.auth).expect(200);
      expect(all.body.data).toHaveLength(5);
      const approvedOnly = await http.get(`/api/v1/admin/vendors?q=${q}&status=APPROVED`).set(admin.auth).expect(200);
      expect(approvedOnly.body.data.map((v: { id: string }) => v.id)).toEqual([ids[4]]);
      expect((await http.get(`/api/v1/admin/vendors?q=${q}&cityId=999999`).set(admin.auth)).body.data).toEqual([]);
    });

    it('rejects bad filters and cursors', async () => {
      for (const qs of ['status=NOPE', 'limit=0', 'limit=51', 'cityId=abc', 'cursor=garbage', 'unknown=1']) {
        const res = await http.get(`/api/v1/admin/vendors?${qs}`).set(admin.auth).expect(400);
        expect(['VALIDATION_FAILED', 'INVALID_CURSOR']).toContain(res.body.error.code);
      }
    });
  });

  describe('detail and CNIC', () => {
    it('shows owner, masked CNIC and short-lived signed document links; never the ciphertext or hash', async () => {
      const { vendor, owner, cnic } = await createVendorFixture(t, cityId, { status: VendorStatus.PENDING });
      const res = await http.get(`/api/v1/admin/vendors/${vendor.id}`).set(admin.auth).expect(200);
      const d = res.body.data;

      expect(d).toMatchObject({ id: vendor.id, status: 'PENDING', owner: { id: owner.user.id, phone: owner.user.phone } });
      expect(d.cnicMasked).toBe(`${'*'.repeat(9)}${cnic.slice(-4)}`);
      expect(d.documents).toHaveLength(3);
      for (const doc of d.documents) expect(doc.signedUrl).toMatch(/^https:\/\/signed\.test\/.+\.jpg\?ttl=600$/);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(cnic);
      expect(text).not.toMatch(/cnicEnc|cnicHash/);
    });

    it('still works (without links) when media storage is unavailable', async () => {
      const broken = await createTestApp({
        customize: (b) =>
          b.overrideProvider(CloudinaryService).useValue({
            ...fakeCloudinary(),
            privateDownloadUrl: () => {
              throw new Error('not configured');
            },
          }),
      });
      try {
        const adm = await createAdmin(broken);
        const { vendor } = await createVendorFixture(broken, cityId, { status: VendorStatus.PENDING });
        const res = await request(broken.app.getHttpServer()).get(`/api/v1/admin/vendors/${vendor.id}`).set(adm.auth).expect(200);
        expect(res.body.data.documents.every((d: { signedUrl: unknown }) => d.signedUrl === null)).toBe(true);
      } finally {
        await broken.close();
      }
    });

    it('reveals the plaintext CNIC to admins only, and audits every reveal', async () => {
      const { vendor, owner, cnic } = await createVendorFixture(t, cityId, { status: VendorStatus.PENDING });
      await http.get(`/api/v1/admin/vendors/${vendor.id}/cnic`).set(owner.auth).expect(403);
      expect(await auditActions(vendor.id)).toEqual([]);

      const res = await http.get(`/api/v1/admin/vendors/${vendor.id}/cnic`).set(admin.auth).expect(200);
      expect(res.body.data.cnic).toBe(`${cnic.slice(0, 5)}-${cnic.slice(5, 12)}-${cnic.slice(12)}`);
      await http.get(`/api/v1/admin/vendors/${vendor.id}/cnic`).set(admin.auth).expect(200);

      const rows = await t.prisma.auditLog.findMany({ where: { entityId: vendor.id } });
      expect(rows.map((r) => r.action)).toEqual(['VENDOR_CNIC_VIEWED', 'VENDOR_CNIC_VIEWED']);
      expect(rows[0]).toMatchObject({ actorId: admin.user.id, actorRole: 'ADMIN', requestId: expect.any(String) });
      expect(JSON.stringify(rows)).not.toContain(cnic);
    });

    it('re-encrypts the CNIC with the current key when it was written with a retired one', async () => {
      const hmac = Buffer.alloc(32, 9);
      const retired = new FieldCrypto({ currentId: 'k1', keys: { k1: Buffer.alloc(32, 7) } }, hmac);
      const rotated = new FieldCrypto({ currentId: 'k2', keys: { k1: Buffer.alloc(32, 7), k2: Buffer.alloc(32, 8) } }, hmac);
      const rotatedApp = await createTestApp({ customize: (b) => b.overrideProvider(FieldCrypto).useValue(rotated) });
      try {
        const adm = await createAdmin(rotatedApp);
        const { vendor, cnic } = await createVendorFixture(rotatedApp, cityId, { status: VendorStatus.PENDING });
        await rotatedApp.prisma.vendor.update({ where: { id: vendor.id }, data: { cnicEnc: retired.encrypt(cnic, 'vendor.cnic') } });

        const res = await request(rotatedApp.app.getHttpServer()).get(`/api/v1/admin/vendors/${vendor.id}/cnic`).set(adm.auth).expect(200);
        expect(res.body.data.cnic.replace(/-/g, '')).toBe(cnic);

        const stored = (await rotatedApp.prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).cnicEnc;
        expect(stored.startsWith('k2.')).toBe(true);
        expect(rotated.decrypt(stored, 'vendor.cnic')).toBe(cnic);
      } finally {
        await rotatedApp.close();
      }
    });

    it('404s for unknown vendors and 400s for malformed ids', async () => {
      await http.get('/api/v1/admin/vendors/00000000-0000-4000-8000-000000000000').set(admin.auth).expect(404);
      await http.get('/api/v1/admin/vendors/not-a-uuid').set(admin.auth).expect(400);
      await http.post('/api/v1/admin/vendors/00000000-0000-4000-8000-000000000000/approve').set(admin.auth).expect(404);
    });
  });

  describe('decisions', () => {
    it('approves a pending vendor: status, verified documents, audit trail and notifications', async () => {
      const { vendor, owner } = await createVendorFixture(t, cityId, { status: VendorStatus.PENDING, name: 'Approve Me Laundry' });
      await t.prisma.user.update({ where: { id: owner.user.id }, data: { email: 'approve-me@vendors.test' } });

      const res = await http.post(`/api/v1/admin/vendors/${vendor.id}/approve`).set(admin.auth).expect(200);
      expect(res.body.data).toMatchObject({ id: vendor.id, status: 'APPROVED' });

      const row = await t.prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id }, include: { documents: true } });
      expect(row.approvedAt).not.toBeNull();
      expect(row.approvedById).toBe(admin.user.id);
      expect(row.documents.every((d) => d.verifiedAt !== null)).toBe(true);

      const audit = (await t.prisma.auditLog.findMany({ where: { entityId: vendor.id } }))[0];
      expect(audit).toMatchObject({ action: 'VENDOR_APPROVED', actorId: admin.user.id, actorRole: 'ADMIN' });
      expect(audit.before).toMatchObject({ status: 'PENDING' });
      expect(audit.after).toMatchObject({ status: 'APPROVED' });

      const jobs = Object.fromEntries(queueAdd.mock.calls.map((c) => [c[0], c[1]]));
      expect(jobs['send-email']).toMatchObject({ to: 'approve-me@vendors.test', subject: expect.stringContaining('approved') });
      expect(jobs['send-sms']).toMatchObject({ to: owner.user.phone, message: expect.stringContaining('Approve Me Laundry') });
    });

    it('a notification outage does not undo the decision', async () => {
      queueAdd.mockRejectedValue(new Error('redis down'));
      const { vendor } = await createVendorFixture(t, cityId, { status: VendorStatus.PENDING });
      await http.post(`/api/v1/admin/vendors/${vendor.id}/approve`).set(admin.auth).expect(200);
      expect((await t.prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).status).toBe('APPROVED');
    });

    it('rejects with a mandatory reason that the vendor can see', async () => {
      const { vendor, owner } = await createVendorFixture(t, cityId, { status: VendorStatus.PENDING });
      await http.post(`/api/v1/admin/vendors/${vendor.id}/reject`).set(admin.auth).send({}).expect(400);
      await http.post(`/api/v1/admin/vendors/${vendor.id}/reject`).set(admin.auth).send({ reason: 'no' }).expect(400);
      expect((await t.prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).status).toBe('PENDING');

      const res = await http.post(`/api/v1/admin/vendors/${vendor.id}/reject`).set(admin.auth).send({ reason: '  CNIC photo is blurry  ' }).expect(200);
      expect(res.body.data).toMatchObject({ status: 'REJECTED', rejectionReason: 'CNIC photo is blurry' });
      expect((await http.get('/api/v1/vendor/profile').set(owner.auth).expect(200)).body.data).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'CNIC photo is blurry',
      });
      expect(queueAdd.mock.calls.find((c) => c[0] === 'send-sms')![1].message).toContain('CNIC photo is blurry');
    });

    it('only moves vendors along valid transitions', async () => {
      const statuses: VendorStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];
      const cases: [VendorStatus, string, number][] = [
        // [starting status, action, expected HTTP status]
        ['PENDING', 'approve', 200], ['APPROVED', 'approve', 409], ['REJECTED', 'approve', 409], ['SUSPENDED', 'approve', 409],
        ['PENDING', 'reject', 200], ['APPROVED', 'reject', 409], ['REJECTED', 'reject', 409], ['SUSPENDED', 'reject', 409],
        ['PENDING', 'suspend', 409], ['APPROVED', 'suspend', 200], ['REJECTED', 'suspend', 409], ['SUSPENDED', 'suspend', 409],
        ['PENDING', 'reactivate', 409], ['APPROVED', 'reactivate', 409], ['REJECTED', 'reactivate', 409], ['SUSPENDED', 'reactivate', 200],
      ];
      expect(new Set(cases.map((c) => c[0]))).toEqual(new Set(statuses));
      for (const [from, action, expected] of cases) {
        const { vendor } = await createVendorFixture(t, cityId, { status: from });
        const res = await http.post(`/api/v1/admin/vendors/${vendor.id}/${action}`).set(admin.auth).send({ reason: 'Because policy says so' });
        expect({ from, action, status: res.status }).toEqual({ from, action, status: expected });
        if (expected === 409) {
          expect(res.body.error.code).toBe('VENDOR_INVALID_TRANSITION');
          expect((await t.prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).status).toBe(from);
          expect(await auditActions(vendor.id)).toEqual([]);
        }
      }
    });

    it('two admins approving at once: one wins, one audit row, one set of notifications', async () => {
      const { vendor } = await createVendorFixture(t, cityId, { status: VendorStatus.PENDING });
      const admin2 = await createAdmin(t);
      const results = await Promise.all([
        http.post(`/api/v1/admin/vendors/${vendor.id}/approve`).set(admin.auth),
        http.post(`/api/v1/admin/vendors/${vendor.id}/approve`).set(admin2.auth),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await auditActions(vendor.id)).toEqual(['VENDOR_APPROVED']);
    });

    it('suspend closes the shop and blocks vendor actions; reactivate restores access but stays closed', async () => {
      const { vendor, owner } = await createVendorFixture(t, cityId);
      await http.patch('/api/v1/vendor/availability').set(owner.auth).send({ availability: 'OPEN' }).expect(200);

      await http.post(`/api/v1/admin/vendors/${vendor.id}/suspend`).set(admin.auth).send({}).expect(400);
      const suspended = await http.post(`/api/v1/admin/vendors/${vendor.id}/suspend`).set(admin.auth).send({ reason: 'Repeated customer complaints' }).expect(200);
      expect(suspended.body.data).toMatchObject({ status: 'SUSPENDED', availability: 'CLOSED', rejectionReason: 'Repeated customer complaints' });

      const blocked = await http.patch('/api/v1/vendor/availability').set(owner.auth).send({ availability: 'OPEN' }).expect(403);
      expect(blocked.body.error).toMatchObject({ code: 'VENDOR_NOT_ACTIVE', details: { status: 'SUSPENDED' } });
      await http.get('/api/v1/vendor/catalog/items').set(owner.auth).expect(403);
      expect((await http.get('/api/v1/vendor/profile').set(owner.auth).expect(200)).body.data.status).toBe('SUSPENDED');

      const back = await http.post(`/api/v1/admin/vendors/${vendor.id}/reactivate`).set(admin.auth).expect(200);
      expect(back.body.data).toMatchObject({ status: 'APPROVED', availability: 'CLOSED', rejectionReason: null });
      await http.patch('/api/v1/vendor/availability').set(owner.auth).send({ availability: 'OPEN' }).expect(200);
      expect(await auditActions(vendor.id)).toEqual(['VENDOR_SUSPENDED', 'VENDOR_REACTIVATED']);
    });
  });
});
