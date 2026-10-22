import { Role } from '@prisma/client';
import request from 'supertest';
import { Basics, TestApp, clearRateLimits, createAdmin, createCustomer, createLiveVendor, createTestApp, createUserWithToken, prepareReferenceData } from './helpers';

describe('Admin city settings (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let cityId: number;

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
    // a city of its own so these changes never disturb other suites
    const city = await t.prisma.city.upsert({ where: { name: 'Faisalabad' }, update: { isActive: true, deliveryFee: 100, code: 'LYP' }, create: { name: 'Faisalabad', code: 'LYP', deliveryFee: 100 } });
    cityId = city.id;
  });
  beforeEach(() => clearRateLimits(t.redis));
  afterAll(() => t.close());

  it('is admin only', async () => {
    await http.patch(`/api/v1/admin/cities/${cityId}`).send({ deliveryFee: 1 }).expect(401);
    for (const role of [Role.CUSTOMER, Role.VENDOR_OWNER, Role.VENDOR_STAFF, Role.RIDER]) {
      const { auth } = await createUserWithToken(t, role);
      await http.patch(`/api/v1/admin/cities/${cityId}`).set(auth).send({ deliveryFee: 1 }).expect(403);
    }
    expect(Number((await t.prisma.city.findUniqueOrThrow({ where: { id: cityId } })).deliveryFee)).toBe(100);
  });

  it('changes the delivery fee, which shows in the very next estimate, and writes an audit row', async () => {
    const v = await createLiveVendor(t, { ...basics, cityId }, { items: [{ name: 'Shirt', price: 100 }] });
    const customer = await createCustomer(t);
    const estimate = () =>
      http.post('/api/v1/cart/estimate').set(customer.auth).send({ vendorId: v.vendor.id, items: [{ serviceItemId: v.items[0].id, qty: 1 }] }).expect(200);

    expect((await estimate()).body.data.deliveryFee).toBe('100.00');
    const res = await http.patch(`/api/v1/admin/cities/${cityId}`).set(admin.auth).send({ deliveryFee: 175.5 }).expect(200);
    expect(res.body.data).toMatchObject({ id: cityId, name: 'Faisalabad', deliveryFee: '175.50', isActive: true });
    expect((await estimate()).body.data).toMatchObject({ deliveryFee: '175.50', total: '275.50' });

    const audit = await t.prisma.auditLog.findMany({ where: { entity: 'City', entityId: String(cityId) } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'CITY_UPDATED', actorId: admin.user.id, actorRole: 'ADMIN' });
    expect(audit[0].before).toMatchObject({ deliveryFee: '100.00' });
    expect(audit[0].after).toMatchObject({ deliveryFee: '175.50' });
  });

  it('normalises the order code and keeps it unique', async () => {
    const res = await http.patch(`/api/v1/admin/cities/${cityId}`).set(admin.auth).send({ code: ' fsd ' }).expect(200);
    expect(res.body.data.code).toBe('FSD');
    const clash = await http.patch(`/api/v1/admin/cities/${cityId}`).set(admin.auth).send({ code: 'LHR' }).expect(409);
    expect(clash.body.error.code).toBe('CONFLICT');
  });

  it('switching a city off removes it from the public list and on again restores it', async () => {
    await http.patch(`/api/v1/admin/cities/${cityId}`).set(admin.auth).send({ isActive: false }).expect(200);
    expect((await http.get('/api/v1/cities').expect(200)).body.data.map((c: { name: string }) => c.name)).not.toContain('Faisalabad');
    await http.patch(`/api/v1/admin/cities/${cityId}`).set(admin.auth).send({ isActive: true }).expect(200);
    expect((await http.get('/api/v1/cities').expect(200)).body.data.map((c: { name: string }) => c.name)).toContain('Faisalabad');
  });

  it.each([
    ['a negative fee', { deliveryFee: -1 }],
    ['a fee above Rs 5000', { deliveryFee: 5001 }],
    ['a fee with 3 decimals', { deliveryFee: 10.123 }],
    ['a textual fee', { deliveryFee: 'free' }],
    ['a lowercase-only digit code', { code: '12' }],
    ['a code that is too long', { code: 'ABCDE' }],
    ['an unknown field', { name: 'Hacked' }],
    ['a non-boolean isActive', { isActive: 'yes' }],
  ])('rejects %s', async (_label, body) => {
    const res = await http.patch(`/api/v1/admin/cities/${cityId}`).set(admin.auth).send(body).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('404s for unknown cities and 400s for junk ids', async () => {
    await http.patch('/api/v1/admin/cities/99999999').set(admin.auth).send({ deliveryFee: 1 }).expect(404);
    await http.patch('/api/v1/admin/cities/abc').set(admin.auth).send({ deliveryFee: 1 }).expect(400);
  });
});
