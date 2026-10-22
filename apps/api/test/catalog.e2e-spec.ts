import { Role, VendorStatus } from '@prisma/client';
import request from 'supertest';
import {
  TestApp,
  clearRateLimits,
  createTestApp,
  createUserWithToken,
  createVendorFixture,
  ensureCatalogBasics,
  otpLogin,
  randomPhone,
} from './helpers';

describe('Catalog (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let cityId: number;
  let washIronId: number;
  let dryCleanId: number;

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
    ({ cityId, washIronId, dryCleanId } = await ensureCatalogBasics(t));
  });
  beforeEach(() => clearRateLimits(t.redis));
  afterAll(() => t.close());

  const item = (extra: Record<string, unknown> = {}) => ({
    categoryId: washIronId,
    itemName: `Shirt ${Math.random().toString(36).slice(2, 8)}`,
    itemNameUr: 'قمیض',
    serviceType: 'WASH_IRON',
    price: 150,
    turnaroundHours: 48,
    ...extra,
  });

  describe('GET /service-categories', () => {
    it('is public', async () => {
      const res = await http.get('/api/v1/service-categories').expect(200);
      expect(res.body.data.map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['Wash & Iron', 'Dry Cleaning']));
    });
  });

  describe('item CRUD', () => {
    it('creates, lists, updates and soft-deletes items', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const created = await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(item({ itemName: ' Bedsheet ', price: 450.5 })).expect(201);
      const id = created.body.data.id;
      expect(created.body.data).toMatchObject({ itemName: 'Bedsheet', itemNameUr: 'قمیض', isActive: true, turnaroundHours: 48 });
      expect(Number(created.body.data.price)).toBe(450.5);
      expect(created.body.data.category).toMatchObject({ id: washIronId, name: 'Wash & Iron' });

      const updated = await http
        .patch(`/api/v1/vendor/catalog/items/${id}`)
        .set(owner.auth)
        .send({ price: 500, isActive: false, categoryId: dryCleanId })
        .expect(200);
      expect(updated.body.data).toMatchObject({ isActive: false, categoryId: dryCleanId });
      expect(Number(updated.body.data.price)).toBe(500);

      const list = await http.get('/api/v1/vendor/catalog/items').set(owner.auth).expect(200);
      expect(list.body.data).toHaveLength(1); // inactive items stay visible to the vendor

      await http.delete(`/api/v1/vendor/catalog/items/${id}`).set(owner.auth).expect(204);
      expect((await http.get('/api/v1/vendor/catalog/items').set(owner.auth)).body.data).toEqual([]);
      const row = await t.prisma.serviceItem.findUniqueOrThrow({ where: { id } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.isActive).toBe(false);
      await http.patch(`/api/v1/vendor/catalog/items/${id}`).set(owner.auth).send({ price: 1 }).expect(404);
      await http.delete(`/api/v1/vendor/catalog/items/${id}`).set(owner.auth).expect(404);
    });

    it('refuses a duplicate name + service, but brings a deleted item back instead of failing', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const body = item({ itemName: 'Suit', serviceType: 'DRY_CLEAN', categoryId: dryCleanId });
      const first = await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(body).expect(201);
      const dup = await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(body).expect(409);
      expect(dup.body.error.code).toBe('ITEM_EXISTS');
      await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send({ ...body, serviceType: 'WASH_IRON' }).expect(201);

      await http.delete(`/api/v1/vendor/catalog/items/${first.body.data.id}`).set(owner.auth).expect(204);
      const revived = await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send({ ...body, price: 1999 }).expect(201);
      expect(revived.body.data.id).toBe(first.body.data.id);
      expect(Number(revived.body.data.price)).toBe(1999);
      expect(revived.body.data.isActive).toBe(true);
    });

    it('a rename that collides with another item is a clean 409', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(item({ itemName: 'Kurta' })).expect(201);
      const other = await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(item({ itemName: 'Kameez' })).expect(201);
      await http.patch(`/api/v1/vendor/catalog/items/${other.body.data.id}`).set(owner.auth).send({ itemName: 'Kurta' }).expect(409);
    });

    it.each([
      ['a zero price', { price: 0 }],
      ['a negative price', { price: -5 }],
      ['a price with 3 decimals', { price: 10.123 }],
      ['a price above the cap', { price: 500001 }],
      ['a textual price', { price: 'cheap' }],
      ['zero turnaround', { turnaroundHours: 0 }],
      ['a fractional turnaround', { turnaroundHours: 1.5 }],
      ['a turnaround above 30 days', { turnaroundHours: 721 }],
      ['an unknown service type', { serviceType: 'FOLD_TO_SHAPE' }],
      ['an empty name', { itemName: '   ' }],
      ['a too-long name', { itemName: 'x'.repeat(81) }],
      ['a vendorId (cannot be set by the client)', { vendorId: '00000000-0000-4000-8000-000000000000' }],
      ['an unknown field', { discount: 10 }],
    ])('rejects %s', async (_label, patch) => {
      const { owner } = await createVendorFixture(t, cityId);
      const res = await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(item(patch)).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(await t.prisma.serviceItem.count({ where: { vendorId: owner.user.id } })).toBe(0);
    });

    it('rejects an unknown category and bad ids', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const res = await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(item({ categoryId: 999999 })).expect(400);
      expect(res.body.error.code).toBe('CATEGORY_NOT_FOUND');
      await http.patch('/api/v1/vendor/catalog/items/not-a-uuid').set(owner.auth).send({ price: 5 }).expect(400);
      await http.patch('/api/v1/vendor/catalog/items/00000000-0000-4000-8000-000000000000').set(owner.auth).send({ price: 5 }).expect(404);
    });

    it('accepts the price boundaries', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      for (const price of [1, 0.99 + 0.01, 499999.99, 500000]) {
        await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(item({ price })).expect(201);
      }
    });
  });

  describe('vendors are isolated from each other', () => {
    it("cannot read, edit or delete another vendor's items", async () => {
      const a = await createVendorFixture(t, cityId);
      const b = await createVendorFixture(t, cityId);
      const mine = await http.post('/api/v1/vendor/catalog/items').set(a.owner.auth).send(item({ itemName: 'Private' })).expect(201);
      const id = mine.body.data.id;

      expect((await http.get('/api/v1/vendor/catalog/items').set(b.owner.auth).expect(200)).body.data).toEqual([]);
      await http.patch(`/api/v1/vendor/catalog/items/${id}`).set(b.owner.auth).send({ price: 1 }).expect(404);
      await http.delete(`/api/v1/vendor/catalog/items/${id}`).set(b.owner.auth).expect(404);

      const row = await t.prisma.serviceItem.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ vendorId: a.vendor.id, deletedAt: null });
      expect(Number(row.price)).toBe(150);
    });

    it('lets two vendors use the same item names', async () => {
      const a = await createVendorFixture(t, cityId);
      const b = await createVendorFixture(t, cityId);
      const same = item({ itemName: 'Shirt' });
      await http.post('/api/v1/vendor/catalog/items').set(a.owner.auth).send(same).expect(201);
      await http.post('/api/v1/vendor/catalog/items').set(b.owner.auth).send(same).expect(201);
    });
  });

  describe('who may do what', () => {
    it.each([VendorStatus.PENDING, VendorStatus.REJECTED, VendorStatus.SUSPENDED])('a %s vendor is locked out of the catalog', async (status) => {
      const { owner } = await createVendorFixture(t, cityId, { status });
      for (const call of [
        () => http.get('/api/v1/vendor/catalog/items').set(owner.auth),
        () => http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(item()),
        () => http.post('/api/v1/vendor/catalog/import').set(owner.auth).send({ items: [] }),
      ]) {
        const res = await call().expect(403);
        expect(res.body.error).toMatchObject({ code: 'VENDOR_NOT_ACTIVE', details: { status } });
      }
    });

    it.each([Role.CUSTOMER, Role.RIDER, Role.ADMIN])('%s cannot use vendor catalog routes', async (role) => {
      const { auth } = await createUserWithToken(t, role);
      await http.get('/api/v1/vendor/catalog/items').set(auth).expect(403);
      await http.post('/api/v1/vendor/catalog/items').set(auth).send(item()).expect(403);
    });

    it('requires authentication', async () => {
      await http.get('/api/v1/vendor/catalog/items').expect(401);
    });

    it('staff can read the catalog but not change it', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const created = await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(item()).expect(201);
      const phone = randomPhone();
      await http.post('/api/v1/vendor/staff').set(owner.auth).send({ phone }).expect(201);
      const staff = { Authorization: `Bearer ${(await otpLogin(http, phone)).body.data.accessToken}` };

      expect((await http.get('/api/v1/vendor/catalog/items').set(staff).expect(200)).body.data).toHaveLength(1);
      await http.post('/api/v1/vendor/catalog/items').set(staff).send(item()).expect(403);
      await http.patch(`/api/v1/vendor/catalog/items/${created.body.data.id}`).set(staff).send({ price: 1 }).expect(403);
      await http.delete(`/api/v1/vendor/catalog/items/${created.body.data.id}`).set(staff).expect(403);
      await http.post('/api/v1/vendor/catalog/import').set(staff).send({ items: [] }).expect(403);
    });
  });

  describe('bulk import', () => {
    const row = (extra: Record<string, unknown> = {}) => ({
      itemName: `Item ${Math.random().toString(36).slice(2, 8)}`,
      category: 'wash & iron', // matched case-insensitively
      serviceType: 'WASH_IRON',
      price: 100,
      turnaroundHours: 24,
      ...extra,
    });

    it('imports JSON, creating new items and updating existing ones by name + service', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      await http.post('/api/v1/vendor/catalog/items').set(owner.auth).send(item({ itemName: 'Existing', price: 100 })).expect(201);

      const res = await http
        .post('/api/v1/vendor/catalog/import')
        .set(owner.auth)
        .send({ items: [row({ itemName: 'Existing', price: 175 }), row({ itemName: 'Brand New', category: 'Dry Cleaning', serviceType: 'DRY_CLEAN' })] })
        .expect(200);
      expect(res.body.data).toEqual({ created: 1, updated: 1, total: 2 });

      const list = (await http.get('/api/v1/vendor/catalog/items').set(owner.auth)).body.data as { itemName: string; price: string; category: { name: string } }[];
      expect(list).toHaveLength(2);
      expect(Number(list.find((i) => i.itemName === 'Existing')!.price)).toBe(175);
      expect(list.find((i) => i.itemName === 'Brand New')!.category.name).toBe('Dry Cleaning');
    });

    it('imports a CSV file (quoted fields, Urdu text, blank optional cells)', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const csv = [
        'itemName,itemNameUr,category,serviceType,price,turnaroundHours,isActive',
        'Shirt,قمیض,Wash & Iron,WASH_IRON,150,48,',
        '"Suit, 2-piece",,Dry Cleaning,DRY_CLEAN,1200.50,72,false',
        '',
      ].join('\r\n');
      const res = await http.post('/api/v1/vendor/catalog/import').set(owner.auth).set('Content-Type', 'text/csv').send(csv).expect(200);
      expect(res.body.data).toEqual({ created: 2, updated: 0, total: 2 });

      const list = (await http.get('/api/v1/vendor/catalog/items').set(owner.auth)).body.data as { itemName: string; isActive: boolean; itemNameUr: string | null }[];
      expect(list.find((i) => i.itemName === 'Shirt')).toMatchObject({ itemNameUr: 'قمیض', isActive: true });
      expect(list.find((i) => i.itemName === 'Suit, 2-piece')).toMatchObject({ itemNameUr: null, isActive: false });
    });

    it('is all-or-nothing: any bad row imports nothing and every problem is listed by row', async () => {
      const { owner, vendor } = await createVendorFixture(t, cityId);
      const res = await http
        .post('/api/v1/vendor/catalog/import')
        .set(owner.auth)
        .send({
          items: [
            row({ itemName: 'Good' }),
            row({ price: 0 }),
            row({ category: 'Nonexistent' }),
            row({ itemName: 'Good' }), // duplicate of row 1
            row({ serviceType: 'NOPE', turnaroundHours: 0 }),
          ],
        })
        .expect(422);
      expect(res.body.error.code).toBe('CATALOG_IMPORT_INVALID');
      const rows = res.body.error.details.errors as { row: number; errors: string[] }[];
      // Field errors (rows 2, 5), an unknown category (row 3) and an in-file duplicate (row 4) all arrive together.
      expect(rows.map((r) => r.row)).toEqual([2, 3, 4, 5]);
      expect(rows[1].errors.join(' ')).toMatch(/Unknown category "Nonexistent"/);
      expect(rows[2].errors.join(' ')).toMatch(/Duplicate of row 1/);
      expect(await t.prisma.serviceItem.count({ where: { vendorId: vendor.id } })).toBe(0);

      const dupes = await http.post('/api/v1/vendor/catalog/import').set(owner.auth).send({ items: [row({ itemName: 'Same' }), row({ itemName: 'same' })] }).expect(422);
      expect(dupes.body.error.details.errors[0]).toMatchObject({ row: 2 });
      expect(await t.prisma.serviceItem.count({ where: { vendorId: vendor.id } })).toBe(0);
    });

    it('rejects malformed, empty and oversized imports', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const post = () => http.post('/api/v1/vendor/catalog/import').set(owner.auth);
      expect((await post().send({}).expect(400)).body.error.code).toBe('CATALOG_IMPORT_INVALID');
      await post().send({ items: [] }).expect(400);
      await post().send({ items: 'nope' }).expect(400);
      await post().set('Content-Type', 'text/csv').send('   ').expect(400);
      await post().set('Content-Type', 'text/csv').send('itemName\n"unterminated').expect(400);
      await post().send({ items: Array.from({ length: 501 }, (_, i) => row({ itemName: `n${i}` })) }).expect(400);
    });

    it('cannot smuggle a vendorId or another vendor into an import', async () => {
      const a = await createVendorFixture(t, cityId);
      const b = await createVendorFixture(t, cityId);
      const res = await http
        .post('/api/v1/vendor/catalog/import')
        .set(a.owner.auth)
        .send({ items: [row({ vendorId: b.vendor.id })] })
        .expect(422);
      expect(res.body.error.details.errors[0].row).toBe(1);
      expect(await t.prisma.serviceItem.count({ where: { vendorId: b.vendor.id } })).toBe(0);
    });

    it('can import the full 500 rows', async () => {
      const { owner } = await createVendorFixture(t, cityId);
      const items = Array.from({ length: 500 }, (_, i) => row({ itemName: `Bulk ${i}` }));
      const res = await http.post('/api/v1/vendor/catalog/import').set(owner.auth).send({ items }).expect(200);
      expect(res.body.data).toEqual({ created: 500, updated: 0, total: 500 });
    });
  });
});
