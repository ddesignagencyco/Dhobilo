import { getQueueToken } from '@nestjs/bullmq';
import { Role, VendorStatus } from '@prisma/client';
import request from 'supertest';
import { FieldCrypto } from '../src/common/crypto/field-crypto';
import { CloudinaryService, uploadFolder } from '../src/infra/cloudinary/cloudinary.service';
import { QUEUES } from '../src/infra/queue/queues';
import {
  TestApp,
  clearRateLimits,
  createTestApp,
  createUserWithToken,
  createVendorFixture,
  ensureCatalogBasics,
  fakeCloudinary,
  otpLogin,
  randomCnic,
  randomPhone,
} from './helpers';

describe('Vendor registration and panel (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let cityId: number;
  let cloudinary: ReturnType<typeof fakeCloudinary>;

  const emailSeq = (() => {
    let n = 0;
    return () => `owner${++n}-${Date.now()}@vendors.test`;
  })();

  beforeAll(async () => {
    cloudinary = fakeCloudinary();
    t = await createTestApp({
      customize: (b) =>
        b
          .overrideProvider(CloudinaryService)
          .useValue(cloudinary)
          .overrideProvider(getQueueToken(QUEUES.NOTIFICATIONS))
          .useValue({ add: jest.fn() }),
    });
    http = request(t.app.getHttpServer());
    ({ cityId } = await ensureCatalogBasics(t));
  });
  beforeEach(() => clearRateLimits(t.redis));
  afterAll(() => t.close());

  const folderFor = (userId: string) => uploadFolder('test', 'vendor-docs', userId);

  const registerBody = (userId: string, extra: Record<string, unknown> = {}) => ({
    businessName: '  Sparkle Laundry ',
    description: 'Wash, iron and dry clean',
    email: emailSeq(),
    addressLine: '12 Gulberg Main Boulevard',
    cityId,
    lat: 31.5204,
    lng: 74.3587,
    cnic: randomCnic(),
    documents: [
      { type: 'CNIC_FRONT', publicId: `${folderFor(userId)}/front` },
      { type: 'CNIC_BACK', publicId: `${folderFor(userId)}/back` },
      { type: 'SHOP_PHOTO', publicId: `${folderFor(userId)}/shop1` },
    ],
    ...extra,
  });

  describe('POST /vendor/register', () => {
    it('creates a PENDING vendor with the CNIC encrypted and documents stored', async () => {
      const { auth, user } = await createUserWithToken(t, Role.VENDOR_OWNER);
      const body = registerBody(user.id, { cnic: '35202-7654321-9' });
      const res = await http.post('/api/v1/vendor/register').set(auth).send(body).expect(201);
      expect(res.body.data).toMatchObject({ status: 'PENDING', businessName: 'Sparkle Laundry', cityId });

      const vendor = await t.prisma.vendor.findUniqueOrThrow({ where: { id: res.body.data.id }, include: { documents: true } });
      expect(vendor.ownerId).toBe(user.id);
      expect(vendor.cnicEnc).toMatch(/^k1\./);
      expect(vendor.cnicEnc).not.toContain('3520276543219');
      expect(vendor.cnicHash).toBe(t.app.get(FieldCrypto).hash('cnic', '3520276543219'));
      expect(t.app.get(FieldCrypto).decrypt(vendor.cnicEnc, 'vendor.cnic')).toBe('3520276543219');
      expect(vendor.documents.map((d) => d.type).sort()).toEqual(['CNIC_BACK', 'CNIC_FRONT', 'SHOP_PHOTO']);
      expect(vendor.documents.every((d) => d.verifiedAt === null)).toBe(true);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(body.email);

      const audit = await t.prisma.auditLog.findMany({ where: { entity: 'Vendor', entityId: vendor.id } });
      expect(audit.map((a) => a.action)).toEqual(['VENDOR_REGISTERED']);
      expect(audit[0].actorId).toBe(user.id);
    });

    it('never returns the CNIC or its hash', async () => {
      const { auth, user } = await createUserWithToken(t, Role.VENDOR_OWNER);
      const res = await http.post('/api/v1/vendor/register').set(auth).send(registerBody(user.id)).expect(201);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/cnic/i);
    });

    it('checks every uploaded file belongs to the caller (verifyAsset with their private folder)', async () => {
      const { auth, user } = await createUserWithToken(t, Role.VENDOR_OWNER);
      await http.post('/api/v1/vendor/register').set(auth).send(registerBody(user.id)).expect(201);
      expect(cloudinary.verifyAsset).toHaveBeenCalledWith(expect.stringContaining('/front'), folderFor(user.id), 'authenticated');
    });

    it("rejects someone else's uploads and files that were never uploaded", async () => {
      const a = await createUserWithToken(t, Role.VENDOR_OWNER);
      const b = await createUserWithToken(t, Role.VENDOR_OWNER);
      const stolen = registerBody(b.user.id);
      const res = await http.post('/api/v1/vendor/register').set(a.auth).send(stolen).expect(400);
      expect(res.body.error.code).toBe('MEDIA_INVALID_ASSET');

      const missing = registerBody(a.user.id);
      missing.documents[2] = { type: 'SHOP_PHOTO', publicId: `${folderFor(a.user.id)}/missing` };
      await http.post('/api/v1/vendor/register').set(a.auth).send(missing).expect(400);
      expect(await t.prisma.vendor.count({ where: { ownerId: a.user.id } })).toBe(0);
    });

    it.each([
      ['a CNIC that is not 13 digits', { cnic: 'abcdefghijklm' }, 'INVALID_CNIC'],
      ['a too-short CNIC (caught by payload validation)', { cnic: '12345' }, 'VALIDATION_FAILED'],
      ['an all-same-digit CNIC', { cnic: '1111111111111' }, 'INVALID_CNIC'],
      ['a city we do not serve', { cityId: 999999 }, 'CITY_NOT_AVAILABLE'],
      ['a pin outside Pakistan', { lat: 51.5, lng: -0.12 }, 'LOCATION_OUT_OF_RANGE'],
    ])('rejects %s', async (_label, patch, code) => {
      const { auth, user } = await createUserWithToken(t, Role.VENDOR_OWNER);
      const res = await http.post('/api/v1/vendor/register').set(auth).send(registerBody(user.id, patch)).expect(400);
      expect(res.body.error.code).toBe(code);
    });

    it('requires the right set of documents', async () => {
      const { auth, user } = await createUserWithToken(t, Role.VENDOR_OWNER);
      const f = folderFor(user.id);
      const doc = (type: string, name: string) => ({ type, publicId: `${f}/${name}` });
      const cases: [string, object[]][] = [
        ['no CNIC back', [doc('CNIC_FRONT', 'a'), doc('SHOP_PHOTO', 'b'), doc('SHOP_PHOTO', 'c')]],
        ['two CNIC fronts', [doc('CNIC_FRONT', 'a'), doc('CNIC_FRONT', 'a2'), doc('CNIC_BACK', 'b'), doc('SHOP_PHOTO', 'c')]],
        ['no shop photo', [doc('CNIC_FRONT', 'a'), doc('CNIC_BACK', 'b'), doc('BUSINESS_REG', 'c')]],
        ['the same file twice', [doc('CNIC_FRONT', 'a'), doc('CNIC_BACK', 'b'), doc('SHOP_PHOTO', 'a')]],
        ['five shop photos', [doc('CNIC_FRONT', 'a'), doc('CNIC_BACK', 'b'), ...[1, 2, 3, 4, 5].map((n) => doc('SHOP_PHOTO', `s${n}`))]],
      ];
      for (const [label, documents] of cases) {
        const res = await http.post('/api/v1/vendor/register').set(auth).send(registerBody(user.id, { documents })).expect(400);
        expect({ label, code: res.body.error.code }).toEqual({ label, code: 'INVALID_DOCUMENTS' });
      }
    });

    it('validates the payload and refuses unknown fields (no setting status/ownerId)', async () => {
      const { auth, user } = await createUserWithToken(t, Role.VENDOR_OWNER);
      for (const patch of [
        { businessName: 'x' },
        { email: 'not-an-email' },
        { documents: [] },
        { status: 'APPROVED' },
        { ownerId: user.id },
        { ratingAvg: 5 },
      ]) {
        await clearRateLimits(t.redis); // registration is limited to 5 attempts a day, and every refused attempt counts
        const res = await http.post('/api/v1/vendor/register').set(auth).send(registerBody(user.id, patch)).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    });

    it.each([Role.CUSTOMER, Role.RIDER, Role.VENDOR_STAFF, Role.ADMIN])('is closed to %s', async (role) => {
      const { auth, user } = await createUserWithToken(t, role);
      await http.post('/api/v1/vendor/register').set(auth).send(registerBody(user.id)).expect(403);
    });

    it('allows only one registration per account while it is pending', async () => {
      const { auth, user } = await createUserWithToken(t, Role.VENDOR_OWNER);
      await http.post('/api/v1/vendor/register').set(auth).send(registerBody(user.id)).expect(201);
      const res = await http.post('/api/v1/vendor/register').set(auth).send(registerBody(user.id)).expect(409);
      expect(res.body.error).toMatchObject({ code: 'VENDOR_ALREADY_REGISTERED', details: { status: 'PENDING' } });
    });

    it('blocks the same CNIC for a second owner without saying whose it is', async () => {
      const a = await createUserWithToken(t, Role.VENDOR_OWNER);
      const b = await createUserWithToken(t, Role.VENDOR_OWNER);
      await http.post('/api/v1/vendor/register').set(a.auth).send(registerBody(a.user.id, { cnic: '3520299999991' })).expect(201);
      const res = await http.post('/api/v1/vendor/register').set(b.auth).send(registerBody(b.user.id, { cnic: '35202-9999999-1' })).expect(409);
      expect(res.body.error.code).toBe('DUPLICATE_CNIC');
      expect(JSON.stringify(res.body)).not.toContain(a.user.id);
      expect(await t.prisma.vendor.count({ where: { ownerId: b.user.id } })).toBe(0);
    });

    it('blocks an email that already belongs to another account', async () => {
      const a = await createUserWithToken(t, Role.VENDOR_OWNER);
      const b = await createUserWithToken(t, Role.VENDOR_OWNER);
      const email = emailSeq();
      await http.post('/api/v1/vendor/register').set(a.auth).send(registerBody(a.user.id, { email })).expect(201);
      const res = await http.post('/api/v1/vendor/register').set(b.auth).send(registerBody(b.user.id, { email: email.toUpperCase() })).expect(409);
      expect(res.body.error.code).toBe('EMAIL_IN_USE');
    });

    it('lets a REJECTED vendor fix the details and resubmit, replacing documents', async () => {
      const { auth, user } = await createUserWithToken(t, Role.VENDOR_OWNER);
      const first = await http.post('/api/v1/vendor/register').set(auth).send(registerBody(user.id)).expect(201);
      await t.prisma.vendor.update({ where: { id: first.body.data.id }, data: { status: VendorStatus.REJECTED, rejectionReason: 'Blurry CNIC' } });

      const f = folderFor(user.id);
      const second = await http
        .post('/api/v1/vendor/register')
        .set(auth)
        .send(
          registerBody(user.id, {
            businessName: 'Sparkle Laundry (fixed)',
            documents: [
              { type: 'CNIC_FRONT', publicId: `${f}/front2` },
              { type: 'CNIC_BACK', publicId: `${f}/back2` },
              { type: 'SHOP_PHOTO', publicId: `${f}/shop2` },
            ],
          }),
        )
        .expect(201);

      expect(second.body.data.id).toBe(first.body.data.id);
      const vendor = await t.prisma.vendor.findUniqueOrThrow({ where: { id: first.body.data.id }, include: { documents: true } });
      expect(vendor).toMatchObject({ status: 'PENDING', rejectionReason: null, businessName: 'Sparkle Laundry (fixed)' });
      expect(vendor.documents.map((d) => d.publicId).sort()).toEqual([`${f}/back2`, `${f}/front2`, `${f}/shop2`]);
      const actions = (await t.prisma.auditLog.findMany({ where: { entityId: vendor.id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
      expect(actions).toEqual(['VENDOR_REGISTERED', 'VENDOR_RESUBMITTED']);
    });

    it('works end to end for a brand-new phone signing up as a vendor owner', async () => {
      const login = await otpLogin(http, randomPhone(), 'VENDOR_OWNER');
      const { accessToken, user } = login.body.data;
      expect(user.role).toBe('VENDOR_OWNER');
      const res = await http
        .post('/api/v1/vendor/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(registerBody(user.id))
        .expect(201);
      expect(res.body.data.status).toBe('PENDING');
    });
  });

  describe('vendor access by status', () => {
    it('GET /vendor/profile shows status and rejection reason, but no documents URLs or CNIC', async () => {
      const { owner, vendor } = await createVendorFixture(t, cityId, { status: VendorStatus.REJECTED });
      await t.prisma.vendor.update({ where: { id: vendor.id }, data: { rejectionReason: 'Photo unreadable' } });
      const res = await http.get('/api/v1/vendor/profile').set(owner.auth).expect(200);
      expect(res.body.data).toMatchObject({ id: vendor.id, status: 'REJECTED', rejectionReason: 'Photo unreadable' });
      expect(res.body.data.documents.map((d: { type: string }) => d.type).sort()).toEqual(['CNIC_BACK', 'CNIC_FRONT', 'SHOP_PHOTO']);
      expect(JSON.stringify(res.body)).not.toMatch(/cnic(Enc|Hash)|url|publicId/);
    });

    it.each([VendorStatus.PENDING, VendorStatus.REJECTED, VendorStatus.SUSPENDED])(
      'a %s vendor cannot use hours, availability, profile edits or staff',
      async (status) => {
        const { owner } = await createVendorFixture(t, cityId, { status });
        const calls = [
          () => http.get('/api/v1/vendor/hours').set(owner.auth),
          () => http.put('/api/v1/vendor/hours').set(owner.auth).send({ hours: [] }),
          () => http.patch('/api/v1/vendor/availability').set(owner.auth).send({ availability: 'OPEN' }),
          () => http.patch('/api/v1/vendor/profile').set(owner.auth).send({ description: 'x' }),
          () => http.get('/api/v1/vendor/staff').set(owner.auth),
        ];
        for (const call of calls) {
          const res = await call().expect(403);
          expect(res.body.error).toMatchObject({ code: 'VENDOR_NOT_ACTIVE', details: { status } });
        }
      },
    );

    it('a vendor owner who has not registered yet gets VENDOR_NOT_REGISTERED', async () => {
      const { auth } = await createUserWithToken(t, Role.VENDOR_OWNER);
      const res = await http.get('/api/v1/vendor/profile').set(auth).expect(403);
      expect(res.body.error.code).toBe('VENDOR_NOT_REGISTERED');
    });

    it.each([Role.CUSTOMER, Role.RIDER])('%s cannot reach the vendor panel', async (role) => {
      const { auth } = await createUserWithToken(t, role);
      await http.get('/api/v1/vendor/profile').set(auth).expect(403);
    });
  });

  describe('profile, hours and availability (approved vendor)', () => {
    it('updates description, radius and response window; rejects bad values and protected fields', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const ok = await http
        .patch('/api/v1/vendor/profile')
        .set(owner.auth)
        .send({ description: ' Fast and clean ', serviceRadiusKm: 7.5, respondWithinMin: 10, slotCapacity: 4 })
        .expect(200);
      expect(ok.body.data).toMatchObject({ description: 'Fast and clean', respondWithinMin: 10, slotCapacity: 4 });
      expect(Number(ok.body.data.serviceRadiusKm)).toBe(7.5);

      for (const bad of [
        { serviceRadiusKm: 0 },
        { serviceRadiusKm: 51 },
        { serviceRadiusKm: 1.234 },
        { respondWithinMin: 4 },
        { respondWithinMin: 61 },
        { slotCapacity: 0 },
        { slotCapacity: 101 },
        { slotCapacity: 2.5 },
        { status: 'APPROVED' },
        { ratingAvg: 5 },
        { lat: 1 },
      ]) {
        await http.patch('/api/v1/vendor/profile').set(owner.auth).send(bad).expect(400);
      }
    });

    it('sets, reads and fully replaces the weekly hours', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      await http.put('/api/v1/vendor/hours').set(owner.auth).send({ hours: [{ dayOfWeek: 1, opensAt: 540, closesAt: 1260 }, { dayOfWeek: 2, opensAt: 540, closesAt: 1260 }] }).expect(200);
      const replaced = await http.put('/api/v1/vendor/hours').set(owner.auth).send({ hours: [{ dayOfWeek: 6, opensAt: 600, closesAt: 900 }] }).expect(200);
      expect(replaced.body.data).toEqual([{ dayOfWeek: 6, opensAt: 600, closesAt: 900 }]);
      expect((await http.get('/api/v1/vendor/hours').set(owner.auth).expect(200)).body.data).toHaveLength(1);
      expect((await http.put('/api/v1/vendor/hours').set(owner.auth).send({ hours: [] }).expect(200)).body.data).toEqual([]);
    });

    it('validates hours and keeps the old schedule when a replacement is invalid', async () => {
      const { owner, vendor } = await createVendorFixture(t, cityId);
      await http.put('/api/v1/vendor/hours').set(owner.auth).send({ hours: [{ dayOfWeek: 1, opensAt: 540, closesAt: 1260 }] }).expect(200);
      const bad = [
        [{ dayOfWeek: 1, opensAt: 900, closesAt: 900 }],
        [{ dayOfWeek: 1, opensAt: 1000, closesAt: 900 }],
        [{ dayOfWeek: 1, opensAt: 100, closesAt: 200 }, { dayOfWeek: 1, opensAt: 300, closesAt: 400 }],
        [{ dayOfWeek: 7, opensAt: 100, closesAt: 200 }],
        [{ dayOfWeek: 1, opensAt: -1, closesAt: 200 }],
        [{ dayOfWeek: 1, opensAt: 100, closesAt: 1441 }],
        Array.from({ length: 8 }, (_, i) => ({ dayOfWeek: i % 7, opensAt: 1, closesAt: 2 })),
      ];
      for (const hours of bad) await http.put('/api/v1/vendor/hours').set(owner.auth).send({ hours }).expect(400);
      expect(await t.prisma.vendorHours.count({ where: { vendorId: vendor.id } })).toBe(1);
    });

    it('toggles Open / Busy / Closed and rejects other values', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      for (const availability of ['OPEN', 'BUSY', 'CLOSED']) {
        const res = await http.patch('/api/v1/vendor/availability').set(owner.auth).send({ availability }).expect(200);
        expect(res.body.data.availability).toBe(availability);
      }
      await http.patch('/api/v1/vendor/availability').set(owner.auth).send({ availability: 'ON_FIRE' }).expect(400);
    });

    it("never touches another vendor's data", async () => {
      const a = await createVendorFixture(t, cityId);
      const b = await createVendorFixture(t, cityId);
      await http.put('/api/v1/vendor/hours').set(a.owner.auth).send({ hours: [{ dayOfWeek: 1, opensAt: 540, closesAt: 600 }] }).expect(200);
      await http.patch('/api/v1/vendor/availability').set(a.owner.auth).send({ availability: 'OPEN' }).expect(200);
      expect(await t.prisma.vendorHours.count({ where: { vendorId: b.vendor.id } })).toBe(0);
      expect((await t.prisma.vendor.findUniqueOrThrow({ where: { id: b.vendor.id } })).availability).toBe('CLOSED');
      expect((await http.get('/api/v1/vendor/profile').set(b.owner.auth)).body.data.id).toBe(b.vendor.id);
    });
  });

  describe('staff accounts', () => {
    it('owner invites by phone; the staff member signs in with a code and keeps the STAFF role', async () => {
      const { owner, vendor } = await createVendorFixture(t, cityId);
      const phone = randomPhone();
      const invited = await http.post('/api/v1/vendor/staff').set(owner.auth).send({ phone: '0' + phone.slice(3), name: ' Bilal ' }).expect(201);
      expect(invited.body.data).toMatchObject({ phone, name: 'Bilal', status: 'ACTIVE', hasSignedIn: false });

      const login = await otpLogin(http, phone, 'CUSTOMER'); // role in the request is ignored for an existing account
      expect(login.body.data.user.role).toBe('VENDOR_STAFF');
      const staffAuth = { Authorization: `Bearer ${login.body.data.accessToken}` };

      const profile = await http.get('/api/v1/vendor/profile').set(staffAuth).expect(200);
      expect(profile.body.data.id).toBe(vendor.id);
      const list = await http.get('/api/v1/vendor/staff').set(owner.auth).expect(200);
      expect(list.body.data).toEqual([expect.objectContaining({ phone, hasSignedIn: true })]);
    });

    it('staff can switch availability and read hours, but cannot edit the profile, hours or staff', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const phone = randomPhone();
      await http.post('/api/v1/vendor/staff').set(owner.auth).send({ phone }).expect(201);
      const staff = { Authorization: `Bearer ${(await otpLogin(http, phone)).body.data.accessToken}` };

      await http.patch('/api/v1/vendor/availability').set(staff).send({ availability: 'BUSY' }).expect(200);
      await http.get('/api/v1/vendor/hours').set(staff).expect(200);
      await http.patch('/api/v1/vendor/profile').set(staff).send({ description: 'x' }).expect(403);
      await http.put('/api/v1/vendor/hours').set(staff).send({ hours: [] }).expect(403);
      await http.post('/api/v1/vendor/staff').set(staff).send({ phone: randomPhone() }).expect(403);
      await http.get('/api/v1/vendor/staff').set(staff).expect(403);
    });

    it('does not convert existing accounts of other roles', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const customer = await createUserWithToken(t, Role.CUSTOMER);
      const res = await http.post('/api/v1/vendor/staff').set(owner.auth).send({ phone: customer.user.phone }).expect(409);
      expect(res.body.error.code).toBe('PHONE_IN_USE');
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: customer.user.id } })).role).toBe('CUSTOMER');
      const other = await createVendorFixture(t, cityId);
      await http.post('/api/v1/vendor/staff').set(owner.auth).send({ phone: other.owner.user.phone }).expect(409);
    });

    it('rejects duplicates, staff of another vendor, bad numbers, and more than 10 staff', async () => {
      const a = await createVendorFixture(t, cityId);
      const b = await createVendorFixture(t, cityId);
      const phone = randomPhone();
      await http.post('/api/v1/vendor/staff').set(a.owner.auth).send({ phone }).expect(201);
      expect((await http.post('/api/v1/vendor/staff').set(a.owner.auth).send({ phone }).expect(409)).body.error.code).toBe('STAFF_ALREADY_ADDED');
      expect((await http.post('/api/v1/vendor/staff').set(b.owner.auth).send({ phone }).expect(409)).body.error.code).toBe('STAFF_LINKED_ELSEWHERE');
      expect((await http.post('/api/v1/vendor/staff').set(a.owner.auth).send({ phone: '+15551234567' }).expect(400)).body.error.code).toBe('INVALID_PHONE');

      for (let i = 0; i < 9; i++) await http.post('/api/v1/vendor/staff').set(a.owner.auth).send({ phone: randomPhone() }).expect(201);
      const full = await http.post('/api/v1/vendor/staff').set(a.owner.auth).send({ phone: randomPhone() }).expect(422);
      expect(full.body.error.code).toBe('STAFF_LIMIT_REACHED');
    });

    it('removing staff unlinks them and signs them out immediately', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const phone = randomPhone();
      const invited = await http.post('/api/v1/vendor/staff').set(owner.auth).send({ phone }).expect(201);
      const login = await otpLogin(http, phone);
      const staff = { Authorization: `Bearer ${login.body.data.accessToken}` };
      await http.get('/api/v1/vendor/profile').set(staff).expect(200);

      await http.delete(`/api/v1/vendor/staff/${invited.body.data.userId}`).set(owner.auth).expect(204);

      await http.get('/api/v1/vendor/profile').set(staff).expect(401); // session revoked
      await http.post('/api/v1/auth/refresh').send({ refreshToken: login.body.data.refreshToken }).expect(401);
      await http.delete(`/api/v1/vendor/staff/${invited.body.data.userId}`).set(owner.auth).expect(404);
    });

    it("cannot remove another vendor's staff", async () => {
      const a = await createVendorFixture(t, cityId);
      const b = await createVendorFixture(t, cityId);
      const invited = await http.post('/api/v1/vendor/staff').set(a.owner.auth).send({ phone: randomPhone() }).expect(201);
      await http.delete(`/api/v1/vendor/staff/${invited.body.data.userId}`).set(b.owner.auth).expect(404);
      expect(await t.prisma.vendorStaff.count({ where: { userId: invited.body.data.userId } })).toBe(1);
    });
  });

  it('random CNIC helper never yields an invalid CNIC', () => {
    for (let i = 0; i < 50; i++) expect(randomCnic()).toMatch(/^[1-8]\d{12}$/);
  });
});
