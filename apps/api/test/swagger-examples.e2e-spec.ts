import * as argon2 from 'argon2';
import request from 'supertest';
import { OPERATION_DOCS } from '../src/docs';
import { Clock } from '../src/common/time/clock';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createLiveVendor, createTestApp, createVendorFixture, fixedClock, otpLogin, prepareReferenceData, randomPhone } from './helpers';
import { DELIVERY, PICKUP, orderScenario } from './order-helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

/** Every key path in a value: `a.b`, `list[].c`. Arrays contribute their first element; null/primitives are leaves. */
function paths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.length ? paths(value[0], `${prefix}[]`) : [];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [`${prefix}${prefix ? '.' : ''}${k}`, ...paths(v, `${prefix}${prefix ? '.' : ''}${k}`)]);
  return [];
}

/**
 * The documented example must have the same fields as what the server really returns. (Values differ, of course,
 * and a field that is null in the example may be an object in real life, so only key paths present on BOTH sides
 * of a non-null value are compared strictly.)
 */
const problems: string[] = [];

function expectMatchesDocs(key: string, body: unknown) {
  const example = OPERATION_DOCS[key].response?.example as Json;
  const documented = new Set(paths(example));
  const actual = new Set(paths(body));
  const nullInExample = [...documented].filter((p) => {
    const v = p.split('.').reduce<unknown>((o, k) => (o as Json | undefined)?.[k.replace('[]', '')], example);
    return v === null;
  });
  const inDocsOnly = [...documented].filter((p) => !actual.has(p));
  const inRealOnly = [...actual].filter((p) => !documented.has(p) && !nullInExample.some((n) => p.startsWith(`${n}.`)));
  if (inDocsOnly.length || inRealOnly.length) {
    problems.push(`${key}
     documented but not returned: ${inDocsOnly.join(', ') || '-'}
     returned but not documented: ${inRealOnly.join(', ') || '-'}`);
  }
}

describe('Swagger examples match the real API (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let admin: Awaited<ReturnType<typeof createAdmin>>;

  beforeAll(async () => {
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(fixedClock(NOW)) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
  });
  afterEach(() => {
    // every mismatch of the test, reported together
    expect(problems.splice(0)).toEqual([]);
  });
  beforeEach(async () => {
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterAll(() => t.close());

  it('sign-in, profile, addresses and cities', async () => {
    const phone = randomPhone();
    await http.post('/api/v1/auth/otp/request').send({ phone }).expect(200).then((r) => expectMatchesDocs('POST /auth/otp/request', r.body));
    const verify = await http.post('/api/v1/auth/otp/verify').send({ phone, code: '123456' }).expect(200);
    expectMatchesDocs('POST /auth/otp/verify', verify.body);
    const auth = { Authorization: `Bearer ${verify.body.data.accessToken}` };

    await http.get('/api/v1/me').set(auth).expect(200).then((r) => expectMatchesDocs('GET /me', r.body));
    await http.patch('/api/v1/me').set(auth).send({ name: 'Ayesha Khan', locale: 'UR' }).expect(200).then((r) => expectMatchesDocs('PATCH /me', r.body));
    await http.get('/api/v1/me/notification-preferences').set(auth).expect(200).then((r) => expectMatchesDocs('GET /me/notification-preferences', r.body));
    await http.patch('/api/v1/me/notification-preferences').set(auth).send({ whatsapp: false }).expect(200).then((r) => expectMatchesDocs('PATCH /me/notification-preferences', r.body));
    await http.get('/api/v1/cities').expect(200).then((r) => expectMatchesDocs('GET /cities', r.body));

    const created = await http.post('/api/v1/me/addresses').set(auth).send({ label: 'Home', line1: '14 Model Town', area: 'Model Town', cityId: basics.cityId, lat: 31.521, lng: 74.359, isDefault: true }).expect(201);
    expectMatchesDocs('POST /me/addresses', created.body);
    await http.get('/api/v1/me/addresses').set(auth).expect(200).then((r) => expectMatchesDocs('GET /me/addresses', r.body));
    await http.patch(`/api/v1/me/addresses/${created.body.data.id}`).set(auth).send({ line1: '14-B Model Town' }).expect(200).then((r) => expectMatchesDocs('PATCH /me/addresses/{id}', r.body));

    const refreshToken = (await otpLoginBody(phone)).refreshToken;
    await http.post('/api/v1/auth/refresh').send({ refreshToken }).expect(200).then((r) => expectMatchesDocs('POST /auth/refresh', r.body));
    await http.post('/api/v1/auth/logout').send({}).expect(200).then((r) => expectMatchesDocs('POST /auth/logout', r.body));
  });

  async function otpLoginBody(phone: string) {
    return (await otpLogin(http, phone)).body.data as { refreshToken: string };
  }

  it('finding vendors, price lists, slots, cart, estimate, ordering and tracking', async () => {
    const s = await orderScenario(t, basics, {
      name: 'Sparkle Laundry',
      items: [{ name: 'Shirt', price: 120 }, { name: 'Suit (2 piece)', price: 1100, serviceType: 'DRY_CLEAN', categoryId: basics.dryCleanId, turnaroundHours: 72 }],
    });
    const auth = s.customer.auth;
    const vid = s.vendor.vendor.id;

    const search = await http.get('/api/v1/vendors').query({ lat: 31.5204, lng: 74.3587, q: 'Sparkle' }).expect(200);
    expectMatchesDocs('GET /vendors', search.body);
    await http.get(`/api/v1/vendors/${vid}`).expect(200).then((r) => expectMatchesDocs('GET /vendors/{id}', r.body));
    await http.get(`/api/v1/vendors/${vid}/catalog`).expect(200).then((r) => expectMatchesDocs('GET /vendors/{id}/catalog', r.body));
    await http.get(`/api/v1/vendors/${vid}/slots`).query({ date: '2026-10-24', type: 'pickup' }).expect(200).then((r) => expectMatchesDocs('GET /vendors/{id}/slots', r.body));

    const lines = [{ serviceItemId: s.item.id, qty: 3 }];
    await http.put('/api/v1/cart').set(auth).send({ vendorId: vid, items: lines }).expect(200).then((r) => expectMatchesDocs('PUT /cart', r.body));
    await http.get('/api/v1/cart').set(auth).expect(200).then((r) => expectMatchesDocs('GET /cart', r.body));
    const estimate = await http.post('/api/v1/cart/estimate').set(auth).send({ vendorId: vid, items: lines }).expect(200);
    expectMatchesDocs('POST /cart/estimate', estimate.body);

    const placed = await http
      .post('/api/v1/orders')
      .set(auth)
      .set('Idempotency-Key', '5d6f1c3a-7b2e-4f8a-9c10-2e4a6b8c0d12')
      .send({ vendorId: vid, addressId: s.address.id, items: lines, pickupSlotStart: PICKUP, deliverySlotStart: DELIVERY, paymentMethod: 'COD', expectedTotal: estimate.body.data.total, customerNote: 'Please fold gently' })
      .expect(201);
    expectMatchesDocs('POST /orders', placed.body);
    const id = placed.body.data.id;
    await http.get('/api/v1/orders').set(auth).expect(200).then((r) => expectMatchesDocs('GET /orders', r.body));
    await http.get(`/api/v1/orders/${id}`).set(auth).expect(200).then((r) => expectMatchesDocs('GET /orders/{id}', r.body));

    // vendor works it
    const board = await http.get('/api/v1/vendor/orders?status=PLACED').set(s.vendor.owner.auth).expect(200);
    expectMatchesDocs('GET /vendor/orders', board.body);
    await http.get('/api/v1/vendor/orders/counts').set(s.vendor.owner.auth).expect(200).then((r) => expectMatchesDocs('GET /vendor/orders/counts', r.body));
    await http.get(`/api/v1/vendor/orders/${id}`).set(s.vendor.owner.auth).expect(200).then((r) => expectMatchesDocs('GET /vendor/orders/{id}', r.body));
    await http.post(`/api/v1/vendor/orders/${id}/accept`).set(s.vendor.owner.auth).expect(200).then((r) => expectMatchesDocs('POST /vendor/orders/{id}/accept', r.body));
    await http.post(`/api/v1/vendor/orders/${id}/status`).set(s.vendor.owner.auth).send({ status: 'PICKED_UP' }).expect(200).then((r) => expectMatchesDocs('POST /vendor/orders/{id}/status', r.body));
    await http.get(`/api/v1/orders/${id}/timeline`).set(auth).expect(200).then((r) => expectMatchesDocs('GET /orders/{id}/timeline', r.body));


    // cancel / reject on fresh orders
    const second = await http.post('/api/v1/orders').set(auth).set('Idempotency-Key', 'second-order-key-0001').send({ vendorId: vid, addressId: s.address.id, items: lines, pickupSlotStart: PICKUP, deliverySlotStart: DELIVERY, paymentMethod: 'COD', expectedTotal: estimate.body.data.total }).expect(201);
    await http.post(`/api/v1/orders/${second.body.data.id}/cancel`).set(auth).send({ reason: 'Plans changed' }).expect(200).then((r) => expectMatchesDocs('POST /orders/{id}/cancel', r.body));
    const third = await http.post('/api/v1/orders').set(auth).set('Idempotency-Key', 'third-order-key-00001').send({ vendorId: vid, addressId: s.address.id, items: lines, pickupSlotStart: PICKUP, deliverySlotStart: DELIVERY, paymentMethod: 'COD', expectedTotal: estimate.body.data.total }).expect(201);
    await http.post(`/api/v1/vendor/orders/${third.body.data.id}/reject`).set(s.vendor.owner.auth).send({ reason: 'We are fully booked this week.' }).expect(200).then((r) => expectMatchesDocs('POST /vendor/orders/{id}/reject', r.body));

    // admin views
    await http.get('/api/v1/admin/orders').query({ orderNo: placed.body.data.orderNo }).set(admin.auth).expect(200).then((r) => expectMatchesDocs('GET /admin/orders', r.body));
    await http.get(`/api/v1/admin/orders/${id}`).set(admin.auth).expect(200).then((r) => expectMatchesDocs('GET /admin/orders/{id}', r.body));
    const fourth = await http.post('/api/v1/orders').set(auth).set('Idempotency-Key', 'fourth-order-key-0001').send({ vendorId: vid, addressId: s.address.id, items: lines, pickupSlotStart: PICKUP, deliverySlotStart: DELIVERY, paymentMethod: 'COD', expectedTotal: estimate.body.data.total }).expect(201);
    await http.post(`/api/v1/admin/orders/${fourth.body.data.id}/cancel`).set(admin.auth).send({ reason: 'Customer phoned support to cancel.' }).expect(200).then((r) => expectMatchesDocs('POST /admin/orders/{id}/cancel', r.body));

    // give the reorder something to report: an item that is gone and a price that moved
    await t.prisma.orderItem.create({ data: { orderId: id, serviceItemId: null, name: 'Suit (2 piece)', serviceType: 'DRY_CLEAN', unitPrice: 1100, qty: 1, lineTotal: 1100 } });
    await t.prisma.serviceItem.update({ where: { id: s.item.id }, data: { price: 130 } });
    const reorder = await http.post(`/api/v1/orders/${id}/reorder`).set(auth).expect(200);
    expectMatchesDocs('POST /orders/{id}/reorder', reorder.body);
  });

  it('the vendor panel: shop settings, hours, staff and price list', async () => {
    const v = await createLiveVendor(t, basics, { name: 'Panel Laundry' });
    const owner = v.owner.auth;

    await http.get('/api/v1/vendor/profile').set(owner).expect(200).then((r) => expectMatchesDocs('GET /vendor/profile', r.body));
    await http.patch('/api/v1/vendor/profile').set(owner).send({ description: 'Same-day ironing.', serviceRadiusKm: 12, respondWithinMin: 20, slotCapacity: 8 }).expect(200).then((r) => expectMatchesDocs('PATCH /vendor/profile', r.body));
    await http.get('/api/v1/vendor/hours').set(owner).expect(200).then((r) => expectMatchesDocs('GET /vendor/hours', r.body));
    await http.put('/api/v1/vendor/hours').set(owner).send({ hours: [1, 2, 3].map((dayOfWeek) => ({ dayOfWeek, opensAt: 540, closesAt: 1260 })) }).expect(200).then((r) => expectMatchesDocs('PUT /vendor/hours', r.body));
    await http.patch('/api/v1/vendor/availability').set(owner).send({ availability: 'OPEN' }).expect(200).then((r) => expectMatchesDocs('PATCH /vendor/availability', r.body));

    const staff = await http.post('/api/v1/vendor/staff').set(owner).send({ phone: randomPhone(), name: 'Bilal' }).expect(201);
    expectMatchesDocs('POST /vendor/staff', staff.body);
    await http.get('/api/v1/vendor/staff').set(owner).expect(200).then((r) => expectMatchesDocs('GET /vendor/staff', r.body));

    await http.get('/api/v1/service-categories').expect(200).then((r) => expectMatchesDocs('GET /service-categories', r.body));
    const item = await http.post('/api/v1/vendor/catalog/items').set(owner).send({ categoryId: basics.washIronId, itemName: 'Kurta', itemNameUr: 'کرتا', serviceType: 'WASH_IRON', price: 120, turnaroundHours: 48 }).expect(201);
    expectMatchesDocs('POST /vendor/catalog/items', item.body);
    await http.get('/api/v1/vendor/catalog/items').set(owner).expect(200).then((r) => expectMatchesDocs('GET /vendor/catalog/items', r.body));
    await http.patch(`/api/v1/vendor/catalog/items/${item.body.data.id}`).set(owner).send({ price: 135 }).expect(200).then((r) => expectMatchesDocs('PATCH /vendor/catalog/items/{id}', r.body));
    await http.post('/api/v1/vendor/catalog/import').set(owner).send({ items: [{ itemName: 'Dupatta', category: 'Wash & Iron', serviceType: 'WASH_IRON', price: 90, turnaroundHours: 24 }] }).expect(200).then((r) => expectMatchesDocs('POST /vendor/catalog/import', r.body));
    await http.post('/api/v1/media/sign').set(owner).send({ kind: 'vendor-docs' }).expect(200).then((r) => expectMatchesDocs('POST /media/sign', r.body));
  });

  it('admin: vendor review and city settings', async () => {
    const pending = await createVendorFixture(t, basics.cityId, { status: 'PENDING', name: 'Review Me Laundry' });
    await http.get('/api/v1/admin/vendors').query({ status: 'PENDING', q: 'Review Me' }).set(admin.auth).expect(200).then((r) => expectMatchesDocs('GET /admin/vendors', r.body));
    await http.get(`/api/v1/admin/vendors/${pending.vendor.id}`).set(admin.auth).expect(200).then((r) => {
      // document links are null when media storage is not configured in tests; the shape is what matters
      expectMatchesDocs('GET /admin/vendors/{id}', r.body);
    });
    await http.get(`/api/v1/admin/vendors/${pending.vendor.id}/cnic`).set(admin.auth).expect(200).then((r) => expectMatchesDocs('GET /admin/vendors/{id}/cnic', r.body));
    await http.post(`/api/v1/admin/vendors/${pending.vendor.id}/approve`).set(admin.auth).expect(200).then((r) => expectMatchesDocs('POST /admin/vendors/{id}/approve', r.body));
    await http.post(`/api/v1/admin/vendors/${pending.vendor.id}/suspend`).set(admin.auth).send({ reason: 'Repeated customer complaints about damaged items.' }).expect(200).then((r) => expectMatchesDocs('POST /admin/vendors/{id}/suspend', r.body));
    await http.post(`/api/v1/admin/vendors/${pending.vendor.id}/reactivate`).set(admin.auth).expect(200).then((r) => expectMatchesDocs('POST /admin/vendors/{id}/reactivate', r.body));
    const other = await createVendorFixture(t, basics.cityId, { status: 'PENDING' });
    await http.post(`/api/v1/admin/vendors/${other.vendor.id}/reject`).set(admin.auth).send({ reason: 'The CNIC photo is blurry. Please upload a clear one.' }).expect(200).then((r) => expectMatchesDocs('POST /admin/vendors/{id}/reject', r.body));
    await http.patch(`/api/v1/admin/cities/${basics.cityId}`).set(admin.auth).send({ deliveryFee: 150 }).expect(200).then((r) => expectMatchesDocs('PATCH /admin/cities/{id}', r.body));
  });

  it('health checks', async () => {
    await http.get('/api/v1/health/live').expect(200).then((r) => expectMatchesDocs('GET /health/live', r.body));
    await http.get('/api/v1/health/ready').expect(200).then((r) => expectMatchesDocs('GET /health/ready', r.body));
  });

  it('every documented success example has a real call above (nothing is left unverified except the live stream and 204s)', () => {
    // Guards against adding an endpoint example without a matching contract check. Keep this list in sync on purpose.
    const verifiedElsewhere = new Set([
      'GET /orders/{id}/events', // text/event-stream, covered by order-live.e2e-spec.ts
      'POST /auth/admin/login', // covered below
      'POST /me/devices', 'DELETE /me/devices', 'DELETE /me/addresses/{id}', 'DELETE /cart', 'DELETE /vendor/staff/{userId}', 'DELETE /vendor/catalog/items/{id}', // 204 no body
      'POST /vendor/register', // needs Cloudinary assets; covered by vendors.e2e-spec.ts
    ]);
    const source = require('node:fs').readFileSync(__filename, 'utf8') as string;
    const missing = Object.keys(OPERATION_DOCS).filter((key) => OPERATION_DOCS[key].response?.example !== undefined && !verifiedElsewhere.has(key) && !source.includes(`'${key}'`));
    expect(missing).toEqual([]);
  });

  it('admin sign-in matches its documented response', async () => {
    const email = `docs-admin-${Date.now()}@e2e.test`;
    await t.prisma.user.create({ data: { phone: `+92000${Math.floor(1e6 + Math.random() * 9e6)}`, email, role: 'ADMIN', passwordHash: await argon2.hash('Docs-Password-1', { type: argon2.argon2id }) } });
    const res = await http.post('/api/v1/auth/admin/login').send({ email, password: 'Docs-Password-1' }).expect(200);
    expectMatchesDocs('POST /auth/admin/login', res.body);
  });
});
