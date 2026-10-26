import * as argon2 from 'argon2';
import { createHmac } from 'node:crypto';
import type { Job } from 'bullmq';
import request from 'supertest';
import { CodService } from '../src/modules/finance/cod.service';
import { SETTLE_ORDER_JOB, SettleOrderJob } from '../src/modules/finance/finance.jobs';
import { FinanceProcessor } from '../src/modules/finance/finance.processor';
import { LedgerService } from '../src/modules/finance/ledger.service';
import { OPERATION_DOCS } from '../src/docs';
import { Clock } from '../src/common/time/clock';
import { Role } from '@prisma/client';
import { CloudinaryService, uploadFolder } from '../src/infra/cloudinary/cloudinary.service';
import { DispatchService } from '../src/modules/delivery/dispatch.service';
import { mockWebhookSignature } from '../src/modules/delivery/courier/mock-courier.provider';
import { NotificationOrchestrator } from '../src/modules/notifications/notification-orchestrator';
import { AnnouncementFanoutService } from '../src/modules/announcements/announcement-fanout.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { ReportsService } from '../src/modules/reports/reports.service';
import { acceptedOrder, createRider, jobOf } from './delivery-helpers';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createCustomer, createLiveVendor, createTestApp, createUserWithToken, createVendorFixture, fixedClock, otpLogin, prepareReferenceData, randomCnic, randomPhone } from './helpers';
import { DELIVERY, PICKUP, orderScenario, placeOrder } from './order-helpers';

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
  const clock = fixedClock(NOW);

  beforeAll(async () => {
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    basics = await prepareReferenceData(t);
    admin = await createAdmin(t);
  });
  afterEach(() => {
    // every mismatch of the test, reported together
    expect(problems.splice(0)).toEqual([]);
  });
  beforeEach(async () => {
    clock.set(NOW);
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

  it('delivery: the rider app, the dispatch board, courier partners and the customer’s view', async () => {
    const SEARCH_OPEN = new Date('2026-10-24T04:30:00Z');
    const dispatch = t.app.get(DispatchService);
    jest.spyOn(t.app.get(CloudinaryService), 'verifyAsset').mockImplementation(async (publicId: string) => ({ publicId, url: `https://res.cloudinary.com/demo/image/upload/${publicId}.jpg`, bytes: 1000, format: 'jpg' }));
    const notify = jest.spyOn(t.app.get(NotificationOrchestrator), 'notifyUser');
    const code = () => [...notify.mock.calls].reverse().find((c) => c[1] === 'delivery_code')![2].code as string;
    const rider = (r: { auth: Record<string, string> }, method: 'post' | 'get', path: string, body: object = {}) => http[method]('/api/v1/rider' + path).set(r.auth).send(method === 'post' ? body : undefined);
    const adminCall = (method: 'post' | 'get' | 'patch', path: string, body: object = {}) => http[method]('/api/v1' + path).set(admin.auth).send(method === 'get' ? undefined : body);
    await t.prisma.rider.updateMany({ data: { isOnline: false } });
    await t.redis.del(`rider:geo:${basics.cityId}`);

    // — applying, and the admin's review queue —
    const applicant = await createUserWithToken(t, Role.RIDER);
    const apply = (u: typeof applicant) => http.post('/api/v1/rider/register').set(u.auth).send({ name: 'Bilal Ahmed', cnic: randomCnic(), cityId: basics.cityId, photoPublicId: uploadFolder('test', 'rider', u.user.id) + '/face' });
    const registered = await apply(applicant).expect(201);
    expectMatchesDocs('POST /rider/register', registered.body);
    await rider(applicant, 'get', '/status').expect(200).then((r) => expectMatchesDocs('GET /rider/status', r.body));
    const riderId = registered.body.data.id as string;
    await adminCall('get', '/admin/riders?status=PENDING').expect(200).then((r) => expectMatchesDocs('GET /admin/riders', r.body));
    await adminCall('get', `/admin/riders/${riderId}`).expect(200).then((r) => expectMatchesDocs('GET /admin/riders/{id}', r.body));
    await adminCall('get', `/admin/riders/${riderId}/cnic`).expect(200).then((r) => expectMatchesDocs('GET /admin/riders/{id}/cnic', r.body));
    await adminCall('post', `/admin/riders/${riderId}/approve`).expect(200).then((r) => expectMatchesDocs('POST /admin/riders/{id}/approve', r.body));
    await adminCall('post', `/admin/riders/${riderId}/suspend`, { reason: 'Repeated customer complaints' }).expect(200).then((r) => expectMatchesDocs('POST /admin/riders/{id}/suspend', r.body));
    await adminCall('post', `/admin/riders/${riderId}/reactivate`).expect(200).then((r) => expectMatchesDocs('POST /admin/riders/{id}/reactivate', r.body));
    const turnedDown = await apply(await createUserWithToken(t, Role.RIDER)).expect(201);
    await adminCall('post', `/admin/riders/${turnedDown.body.data.id}/reject`, { reason: 'Photo is blurry — please upload a clear one' }).expect(200).then((r) => expectMatchesDocs('POST /admin/riders/{id}/reject', r.body));

    // — three orders waiting for pickup, two riders who work —
    const s = await orderScenario(t, basics);
    const orderA = await acceptedOrder(http, t, s, () => placeOrder(http, s));
    const orderB = await acceptedOrder(http, t, s, () => placeOrder(http, s));
    const orderC = await acceptedOrder(http, t, s, () => placeOrder(http, s));
    const orderD = await acceptedOrder(http, t, s, () => placeOrder(http, s)); // for the courier partner, further down
    const jobD = await jobOf(t, orderD.id, 'PICKUP');
    const jobA = await jobOf(t, orderA.id, 'PICKUP');
    const jobB = await jobOf(t, orderB.id, 'PICKUP');
    const jobC = await jobOf(t, orderC.id, 'PICKUP');
    const r1 = await createRider(t, basics, { name: 'Bilal Ahmed', online: false });
    const r2 = await createRider(t, basics, { name: 'Imran Shah', lat: 31.6 });
    clock.set(SEARCH_OPEN);

    // — the rider app —
    await rider(r1, 'post', '/online', { lat: 31.52, lng: 74.35 }).expect(200).then((r) => expectMatchesDocs('POST /rider/online', r.body));
    await rider(r1, 'post', '/location', { lat: 31.5201, lng: 74.3501 }).expect(200).then((r) => expectMatchesDocs('POST /rider/location', r.body));
    await rider(r1, 'get', '/me').expect(200).then((r) => expectMatchesDocs('GET /rider/me', r.body));
    await rider(r1, 'get', '/jobs/available').expect(200).then((r) => expectMatchesDocs('GET /rider/jobs/available', r.body));
    await rider(r1, 'post', `/jobs/${jobA.id}/claim`).expect(200).then((r) => expectMatchesDocs('POST /rider/jobs/{id}/claim', r.body));
    await rider(r1, 'post', `/jobs/${jobA.id}/release`, { reason: 'My bike broke down' }).expect(200).then((r) => expectMatchesDocs('POST /rider/jobs/{id}/release', r.body));
    expect(await dispatch.dispatch(jobB.id)).toBe('offered');
    await rider(r1, 'post', `/jobs/${jobB.id}/accept`).expect(200).then((r) => expectMatchesDocs('POST /rider/jobs/{id}/accept', r.body));
    expect(await dispatch.dispatch(jobC.id)).toBe('offered');
    await rider(r1, 'post', `/jobs/${jobC.id}/decline`, { reason: 'Too far' }).expect(200).then((r) => expectMatchesDocs('POST /rider/jobs/{id}/decline', r.body));
    await rider(r1, 'get', '/jobs').expect(200).then((r) => expectMatchesDocs('GET /rider/jobs', r.body));
    await rider(r1, 'get', `/jobs/${jobB.id}`).expect(200).then((r) => expectMatchesDocs('GET /rider/jobs/{id}', r.body));
    await rider(r1, 'post', `/jobs/${jobB.id}/start`).expect(200).then((r) => expectMatchesDocs('POST /rider/jobs/{id}/start', r.body));
    await rider(r1, 'post', `/jobs/${jobB.id}/complete`).expect(200); // the pickup: the clothes are with the shop now
    await rider(r2, 'post', `/jobs/${jobC.id}/claim`).expect(200);
    await rider(r2, 'post', `/jobs/${jobC.id}/fail`, { reason: 'Customer did not answer after 3 calls' }).expect(200).then((r) => expectMatchesDocs('POST /rider/jobs/{id}/fail', r.body));

    // — a delivery with the customer’s code —
    for (const status of ['IN_PROCESS', 'READY']) await http.post(`/api/v1/vendor/orders/${orderB.id}/status`).set(s.vendor.owner.auth).send({ status }).expect(200);
    const drop = await jobOf(t, orderB.id, 'DROP');
    await rider(r1, 'post', `/jobs/${drop.id}/claim`).expect(200);
    await rider(r1, 'post', `/jobs/${drop.id}/start`).expect(200);
    await http.get(`/api/v1/orders/${orderB.id}/delivery`).set(s.customer.auth).expect(200).then((r) => expectMatchesDocs('GET /orders/{id}/delivery', r.body));
    await http.get(`/api/v1/orders/${orderB.id}/rider-location`).set(s.customer.auth).expect(200).then((r) => expectMatchesDocs('GET /orders/{id}/rider-location', r.body));
    await http.post(`/api/v1/orders/${orderB.id}/delivery-code/resend`).set(s.customer.auth).expect(200).then((r) => expectMatchesDocs('POST /orders/{id}/delivery-code/resend', r.body));
    const done = await rider(r1, 'post', `/jobs/${drop.id}/complete`, { otp: code() }).expect(200);
    expectMatchesDocs('POST /rider/jobs/{id}/complete', done.body);
    await rider(r1, 'get', '/earnings').expect(200).then((r) => expectMatchesDocs('GET /rider/earnings', r.body));
    await rider(r1, 'post', '/offline').expect(200).then((r) => expectMatchesDocs('POST /rider/offline', r.body));

    // — the dispatch board —
    await adminCall('get', `/admin/delivery/summary?cityId=${basics.cityId}`).expect(200).then((r) => expectMatchesDocs('GET /admin/delivery/summary', r.body));
    await adminCall('get', `/admin/delivery/jobs?riderId=${r1.rider.id}`).expect(200).then((r) => expectMatchesDocs('GET /admin/delivery/jobs', r.body));
    await adminCall('get', `/admin/delivery/jobs/${jobC.id}`).expect(200).then((r) => expectMatchesDocs('GET /admin/delivery/jobs/{id}', r.body));
    await adminCall('post', `/admin/delivery/jobs/${jobC.id}/redispatch`).expect(200).then((r) => expectMatchesDocs('POST /admin/delivery/jobs/{id}/redispatch', r.body));
    await adminCall('post', `/admin/delivery/jobs/${jobC.id}/assign`, { riderId: r2.rider.id }).expect(200).then((r) => expectMatchesDocs('POST /admin/delivery/jobs/{id}/assign', r.body));
    await adminCall('post', `/admin/delivery/jobs/${jobC.id}/unassign`).expect(200).then((r) => expectMatchesDocs('POST /admin/delivery/jobs/{id}/unassign', r.body));
    await adminCall('post', `/admin/delivery/jobs/${jobC.id}/fail`, { reason: 'Customer moved away' }).expect(200).then((r) => expectMatchesDocs('POST /admin/delivery/jobs/{id}/fail', r.body));

    // — a courier partner —
    const partner = await t.prisma.courierPartner.upsert({ where: { code: 'mock' }, update: { isActive: false }, create: { code: 'mock', name: 'Mock courier (testing)' } });
    await adminCall('get', '/admin/courier-partners').expect(200).then((r) => expectMatchesDocs('GET /admin/courier-partners', r.body));
    await adminCall('patch', `/admin/courier-partners/${partner.id}`, { isActive: true }).expect(200).then((r) => expectMatchesDocs('PATCH /admin/courier-partners/{id}', r.body));
    await adminCall('patch', `/admin/cities/${basics.cityId}`, { courierPartnerId: partner.id }).expect(200);
    expect(await dispatch.dispatch(jobD.id)).toBe('partner');
    const event = { eventId: 'evt-docs-0001', trackingRef: (await t.prisma.deliveryJob.findUniqueOrThrow({ where: { id: jobD.id } })).partnerRef!, status: 'IN_TRANSIT' };
    await http.post('/api/v1/webhooks/courier/mock').set('x-courier-signature', mockWebhookSignature('test-courier-secret', event)).send(event).expect(200).then((r) => expectMatchesDocs('POST /webhooks/courier/{code}', r.body));
    await adminCall('patch', `/admin/cities/${basics.cityId}`, { courierPartnerId: null }).expect(200);
    await t.prisma.courierPartner.update({ where: { id: partner.id }, data: { isActive: false } });
  });

  it('money: online payment, ledger, earnings, payouts, commission and cash on delivery', async () => {
    const ledger = t.app.get(LedgerService);
    const processor = new FinanceProcessor(ledger, t.app.get(CodService));
    const adminCall = (method: 'post' | 'get' | 'patch' | 'delete', path: string, body: object = {}) => http[method]('/api/v1' + path).set(admin.auth).send(method === 'get' || method === 'delete' ? undefined : body);
    const s = await orderScenario(t, basics);
    const owner = s.vendor.owner.auth;

    // — an online payment: start it, then the gateway tells us it worked —
    const online = await placeOrder(http, s, { paymentMethod: 'CARD' });
    const checkout = await http.post('/api/v1/payments/initiate').set(s.customer.auth).send({ orderId: online.id }).expect(200);
    expectMatchesDocs('POST /payments/initiate', checkout.body);
    const raw = JSON.stringify({ gatewayRef: checkout.body.data.gatewayRef, status: 'PAID', amount: '350.00', eventId: 'evt-docs-1' });
    const signature = createHmac('sha256', process.env.PAYMENT_MOCK_WEBHOOK_SECRET!).update(raw).digest('hex');
    await http.post('/api/v1/webhooks/card').set('content-type', 'application/json').set('x-payment-signature', signature).send(raw).expect(200).then((r) => expectMatchesDocs('POST /webhooks/{gateway}', r.body));

    // — cash orders: the rider collects the cash at delivery; the vendor is credited when the admin records the deposit —
    const deliverCash = async (rider: Awaited<ReturnType<typeof createRider>>) => {
      const cash = await placeOrder(http, s);
      await t.prisma.deliveryJob.create({ data: { orderId: cash.id, jobType: 'DROP', status: 'COMPLETED', riderId: rider.rider.id, scheduledStart: NOW, scheduledEnd: new Date(NOW.getTime() + 3_600_000), completedAt: NOW, riderFee: '50.00' } });
      await t.prisma.order.update({ where: { id: cash.id }, data: { status: 'DELIVERED', deliveredAt: NOW } });
      await processor.process({ name: SETTLE_ORDER_JOB, data: { orderId: cash.id } } as Job<SettleOrderJob>);
    };
    const rider = await createRider(t, basics, { online: false });
    await deliverCash(rider);
    await adminCall('post', '/admin/cod/settlements', { riderId: rider.rider.id, reference: 'DEP-1024' }).expect(201).then((r) => expectMatchesDocs('POST /admin/cod/settlements', r.body));
    // a second rider whose cash has not been handed in yet
    const holder = await createRider(t, basics, { online: false });
    await deliverCash(holder);

    // — what the vendor sees of their money —
    await http.get('/api/v1/vendor/earnings?range=day').set(owner).expect(200).then((r) => expectMatchesDocs('GET /vendor/earnings', r.body));
    await http.get('/api/v1/vendor/ledger').set(owner).expect(200).then((r) => expectMatchesDocs('GET /vendor/ledger', r.body));
    const payout = await http.post('/api/v1/vendor/payouts').set(owner).send({ amount: '100.00', method: 'BANK', accountRef: 'PK36SCBL0000001123456702', note: 'Weekly payout' }).expect(201);
    expectMatchesDocs('POST /vendor/payouts', payout.body);
    await http.get('/api/v1/vendor/payouts').set(owner).expect(200).then((r) => expectMatchesDocs('GET /vendor/payouts', r.body));

    // — the admin works the payout queue —
    await adminCall('get', '/admin/payouts?status=REQUESTED').expect(200).then((r) => expectMatchesDocs('GET /admin/payouts', r.body));
    await adminCall('post', `/admin/payouts/${payout.body.data.id}/approve`).expect(200).then((r) => expectMatchesDocs('POST /admin/payouts/{id}/approve', r.body));
    await adminCall('post', `/admin/payouts/${payout.body.data.id}/pay`, { txnRef: 'BANK-889122' }).expect(200).then((r) => expectMatchesDocs('POST /admin/payouts/{id}/pay', r.body));
    const second = await http.post('/api/v1/vendor/payouts').set(owner).send({ amount: '20.00', method: 'WALLET', accountRef: '03001234567' }).expect(201);
    await adminCall('post', `/admin/payouts/${second.body.data.id}/reject`, { reason: 'Wallet details need updating' }).expect(200).then((r) => expectMatchesDocs('POST /admin/payouts/{id}/reject', r.body));

    // — commission rules —
    const rule = await adminCall('post', '/admin/commission-rules', { scope: 'VENDOR', vendorId: s.vendor.vendor.id, ratePct: 10 }).expect(201);
    expectMatchesDocs('POST /admin/commission-rules', rule.body);
    await adminCall('get', `/admin/commission-rules?vendorId=${s.vendor.vendor.id}`).expect(200).then((r) => expectMatchesDocs('GET /admin/commission-rules', r.body));
    await adminCall('patch', `/admin/commission-rules/${rule.body.data.id}`, { ratePct: 12.5 }).expect(200).then((r) => expectMatchesDocs('PATCH /admin/commission-rules/{id}', r.body));
    await adminCall('delete', `/admin/commission-rules/${rule.body.data.id}`).expect(204);

    // — the cash still in the second rider's hand —
    await http.get('/api/v1/rider/cod').set(holder.auth).expect(200).then((r) => expectMatchesDocs('GET /rider/cod', r.body));
    await adminCall('get', '/admin/cod/balances').expect(200).then((r) => expectMatchesDocs('GET /admin/cod/balances', r.body));
    await adminCall('get', `/admin/cod/collections?riderId=${holder.rider.id}&settled=false`).expect(200).then((r) => expectMatchesDocs('GET /admin/cod/collections', r.body));
  });

  it('reporting: analytics, reports, announcements and the audit log', async () => {
    const adminGet = (path: string) => http.get('/api/v1' + path).set(admin.auth);
    const s = await orderScenario(t, basics);
    const vendorId = s.vendor.vendor.id;
    const at = (iso: string) => new Date(iso);

    // — a week of trade for one shop: a delivered order with items and a rating, and one still in progress —
    const make = async (placed: string, status: 'DELIVERED' | 'IN_PROCESS', total: number) =>
      t.prisma.order.create({
        data: {
          orderNo: `C-${Math.random().toString(36).slice(2, 10)}`, customerId: s.customer.user.id, vendorId, cityId: basics.cityId, addressSnapshot: {}, status,
          pickupSlotStart: at(placed), pickupSlotEnd: at(placed), deliverySlotStart: at(placed), deliverySlotEnd: at(placed),
          subtotal: total, deliveryFee: 50, total, commissionRatePct: 15, commissionAmount: total * 0.15, vendorEarning: total * 0.85,
          paymentMethod: 'COD', paymentStatus: 'COD_PENDING', vendorRespondBy: at(placed), createdAt: at(placed), placedAt: at(placed),
          deliveredAt: status === 'DELIVERED' ? at('2026-10-21T12:00:00Z') : null,
        },
      });
    const delivered = await make('2026-10-21T06:00:00Z', 'DELIVERED', 1000);
    await make('2026-10-22T06:00:00Z', 'IN_PROCESS', 400);
    await t.prisma.orderItem.create({ data: { orderId: delivered.id, name: 'Shirt', serviceType: 'WASH_IRON', unitPrice: 100, qty: 10, lineTotal: 1000 } });
    await t.prisma.review.create({ data: { orderId: delivered.id, customerId: s.customer.user.id, targetType: 'VENDOR', vendorId, rating: 5, createdAt: at('2026-10-21T14:00:00Z') } });

    // — the admin dashboard —
    const range = 'from=2026-10-17&to=2026-10-23';
    await adminGet(`/admin/analytics/overview?${range}`).expect(200).then((r) => expectMatchesDocs('GET /admin/analytics/overview', r.body));
    await adminGet(`/admin/analytics/orders?${range}`).expect(200).then((r) => expectMatchesDocs('GET /admin/analytics/orders', r.body));
    await adminGet(`/admin/analytics/revenue?${range}`).expect(200).then((r) => expectMatchesDocs('GET /admin/analytics/revenue', r.body));
    await adminGet(`/admin/analytics/vendors?${range}`).expect(200).then((r) => expectMatchesDocs('GET /admin/analytics/vendors', r.body));
    await http.post('/api/v1/admin/analytics/rollup').set(admin.auth).send({ from: '2026-10-19', to: '2026-10-21' }).expect(202).then((r) => expectMatchesDocs('POST /admin/analytics/rollup', r.body));

    // — the shop's own view —
    await http.get('/api/v1/vendor/analytics?days=7').set(s.vendor.owner.auth).expect(200).then((r) => expectMatchesDocs('GET /vendor/analytics', r.body));

    // — a report: requested, built by the worker, then listed and opened —
    const requested = await http.post('/api/v1/admin/reports').set(admin.auth).send({ type: 'ORDERS', format: 'XLSX', from: '2026-10-17', to: '2026-10-23', cityId: basics.cityId }).expect(202);
    expectMatchesDocs('POST /admin/reports', requested.body);
    await t.app.get(ReportsService).generate(requested.body.data.id, true);
    await adminGet('/admin/reports').expect(200).then((r) => expectMatchesDocs('GET /admin/reports', r.body));
    const opened = await adminGet(`/admin/reports/${requested.body.data.id}`).expect(200);
    expectMatchesDocs('GET /admin/reports/{id}', opened.body);
    const file = await http.get(opened.body.data.download.url).expect(200);
    expect(file.headers['content-type']).toContain('spreadsheetml');

    // — an announcement: preview, send, let the worker fan it out, then read it back —
    const fan = await createCustomer(t);
    await t.prisma.address.create({ data: { userId: fan.user.id, cityId: basics.cityId, line1: '9 Docs Rd', label: 'Home', lat: 31.5, lng: 74.3 } });
    await t.prisma.deviceToken.create({ data: { userId: fan.user.id, token: `docs-token-${fan.user.id}`, platform: 'android' } });
    await t.prisma.user.update({ where: { id: fan.user.id }, data: { lastLoginAt: clock.now() } });
    const only = { roles: ['CUSTOMER'], cityId: basics.cityId, activeWithinDays: 1 };
    const preview = await http.post('/api/v1/admin/announcements/preview').set(admin.auth).send({ segment: only, channels: ['PUSH'] }).expect(200);
    expectMatchesDocs('POST /admin/announcements/preview', preview.body);
    const sent = await http.post('/api/v1/admin/announcements').set(admin.auth).send({ title: 'Eid offer', body: 'Get 15% off your next laundry order this week.', segment: only, channels: ['PUSH'], confirmRecipients: preview.body.data.recipients }).expect(202);
    expectMatchesDocs('POST /admin/announcements', sent.body);
    await t.app.get(AnnouncementFanoutService).run(sent.body.data.id);
    await adminGet('/admin/announcements').expect(200).then((r) => expectMatchesDocs('GET /admin/announcements', r.body));
    await adminGet(`/admin/announcements/${sent.body.data.id}`).expect(200).then((r) => expectMatchesDocs('GET /admin/announcements/{id}', r.body));

    // — the audit trail (the newest entry is the one the example describes) —
    await t.app.get(AuditService).record({ action: 'PAYOUT_APPROVED', entity: 'Payout', entityId: s.vendor.vendor.id, actorId: admin.user.id, actorRole: Role.ADMIN, after: { status: 'APPROVED' }, ip: '203.0.113.7', requestId: 'req-docs' });
    await adminGet('/admin/audit-logs').expect(200).then((r) => expectMatchesDocs('GET /admin/audit-logs', r.body));
  });

  it('health checks', async () => {
    await http.get('/api/v1/health/live').expect(200).then((r) => expectMatchesDocs('GET /health/live', r.body));
    await http.get('/api/v1/health/ready').expect(200).then((r) => expectMatchesDocs('GET /health/ready', r.body));
  });

  it('every documented success example has a real call above (nothing is left unverified except the live stream and 204s)', () => {
    // Guards against adding an endpoint example without a matching contract check. Keep this list in sync on purpose.
    const verifiedElsewhere = new Set([
      'GET /orders/{id}/events', // text/event-stream, covered by order-live.e2e-spec.ts
      'GET /reports/{id}/download', // a file, not JSON: covered by reports.e2e-spec.ts (and its headers are checked above)
      'POST /auth/admin/login', // covered below
      'POST /me/devices', 'DELETE /me/devices', 'DELETE /me/addresses/{id}', 'DELETE /cart', 'DELETE /vendor/staff/{userId}', 'DELETE /vendor/catalog/items/{id}', // 204 no body
      'POST /vendor/register', // needs Cloudinary assets; covered by vendors.e2e-spec.ts
      // Reviews, promos, referrals and complaints are covered by their own e2e specs.
      'POST /promos/validate', 'GET /me/referral', 'GET /admin/promos', 'POST /admin/promos', 'GET /admin/promos/{id}', 'PATCH /admin/promos/{id}',
      'POST /orders/{orderId}/reviews', 'GET /vendors/{vendorId}/reviews',
      'POST /orders/{orderId}/complaints', 'GET /orders/{orderId}/complaints', 'GET /orders/{orderId}/complaints/{id}', 'POST /orders/{orderId}/complaints/{id}/messages',
      'GET /vendor/complaints', 'GET /vendor/complaints/{id}', 'POST /vendor/complaints/{id}/reply',
      'GET /admin/complaints', 'GET /admin/complaints/{id}', 'POST /admin/complaints/{id}/assign', 'POST /admin/complaints/{id}/messages', 'POST /admin/complaints/{id}/resolve',
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
