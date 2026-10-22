import request from 'supertest';
import { Clock } from '../src/common/time/clock';
import { Basics, NOW, TestApp, clearRateLimits, createAdmin, createLiveVendor, createTestApp, fixedClock, prepareReferenceData } from './helpers';

// All vendors here live around Karachi (24.86, 67.00), far from the Lahore fixtures other test files create,
// and every query is restricted to the Karachi city, so suites cannot see each other's vendors.
const HERE = { lat: 24.8607, lng: 67.0011 };
const km = (n: number) => n / 111.19; // degrees of latitude per km

describe('Vendor discovery (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let basics: Basics;
  let clock: ReturnType<typeof fixedClock>;
  let cityId: number;
  const tagSeq = (() => {
    let n = 0;
    return () => `disc${Date.now().toString(36)}${++n}`;
  })();

  beforeAll(async () => {
    clock = fixedClock();
    t = await createTestApp({ customize: (b) => b.overrideProvider(Clock).useValue(clock) });
    http = request(t.app.getHttpServer());
    const lahore = await prepareReferenceData(t);
    const karachi = await t.prisma.city.upsert({ where: { name: 'Karachi' }, update: { isActive: true, code: 'KHI', deliveryFee: 150 }, create: { name: 'Karachi', code: 'KHI', deliveryFee: 150 } });
    cityId = karachi.id;
    basics = { ...lahore, cityId };
  });
  beforeEach(async () => {
    clock.set(NOW);
    await clearRateLimits(t.redis);
    await t.redis.incr('disc:ver');
  });
  afterAll(() => t.close());

  const live = async (tag: string, label: string, opts: Parameters<typeof createLiveVendor>[2] = {}) => {
    const v = await createLiveVendor(t, basics, { lat: HERE.lat, lng: HERE.lng, ...opts, name: `${tag} ${label}` });
    return v;
  };
  const search = (params: Record<string, unknown> = {}) =>
    http.get('/api/v1/vendors').query({ ...HERE, cityId, ...params });
  const names = (res: request.Response) => (res.body.data as { businessName: string }[]).map((v) => v.businessName.replace(/^\S+ /, ''));
  const bump = () => t.redis.incr('disc:ver');

  describe('who is listed', () => {
    it('only approved, open vendors inside their opening hours with at least one active item', async () => {
      const tag = tagSeq();
      await live(tag, 'live');
      await live(tag, 'pending', { status: 'PENDING' });
      await live(tag, 'rejected', { status: 'REJECTED' });
      await live(tag, 'suspended', { status: 'SUSPENDED' });
      await live(tag, 'closed', { availability: 'CLOSED' });
      await live(tag, 'busy', { availability: 'BUSY' });
      await live(tag, 'no-hours', { hours: 'none' });
      await live(tag, 'outside-hours', { hours: { opensAt: 0, closesAt: 60 } }); // now is 10:00 local
      await live(tag, 'no-items', { items: [] });
      await live(tag, 'inactive-items', { items: [{ name: 'Shirt', price: 100, isActive: false }] });
      const deleted = await live(tag, 'deleted-items');
      await t.prisma.serviceItem.updateMany({ where: { vendorId: deleted.vendor.id }, data: { deletedAt: new Date() } });
      await bump();

      const res = await search({ q: tag }).expect(200);
      expect(names(res)).toEqual(['live']);
    });

    it('opening hours are evaluated in the city timezone, per weekday', async () => {
      const tag = tagSeq();
      // 09:00-21:00 every day
      await live(tag, 'day-shift', { hours: { opensAt: 540, closesAt: 1260 } });
      expect(names(await search({ q: tag }).expect(200))).toEqual(['day-shift']); // 10:00 PKT

      clock.set(new Date('2026-10-23T18:30:00Z')); // 23:30 PKT
      await bump();
      expect(names(await search({ q: tag }).expect(200))).toEqual([]);

      clock.set(new Date('2026-10-23T16:00:00Z')); // 21:00 PKT: closing time itself is closed
      await bump();
      expect(names(await search({ q: tag }).expect(200))).toEqual([]);
      clock.set(new Date('2026-10-23T15:59:00Z')); // 20:59
      await bump();
      expect(names(await search({ q: tag }).expect(200))).toEqual(['day-shift']);
    });

    it('hides everything in a city that is switched off', async () => {
      const tag = tagSeq();
      await live(tag, 'live');
      await t.prisma.city.update({ where: { id: cityId }, data: { isActive: false } });
      await bump();
      try {
        expect(names(await search({ q: tag }).expect(200))).toEqual([]);
      } finally {
        await t.prisma.city.update({ where: { id: cityId }, data: { isActive: true } });
      }
    });

    it('needs no login', async () => {
      await search().expect(200);
    });
  });

  describe('distance and service radius', () => {
    it('lists vendors whose own radius reaches the customer, nearest first, with distances', async () => {
      const tag = tagSeq();
      await live(tag, 'near', { lat: HERE.lat + km(1), radiusKm: 10 });
      await live(tag, 'mid', { lat: HERE.lat + km(4), radiusKm: 10 });
      await live(tag, 'far-in-radius', { lat: HERE.lat + km(8), radiusKm: 10 });
      await live(tag, 'too-far', { lat: HERE.lat + km(12), radiusKm: 10 });
      await live(tag, 'short-radius', { lat: HERE.lat + km(4), radiusKm: 3 }); // customer is 4 km away > its 3 km
      await live(tag, 'exact-edge', { lat: HERE.lat + km(5), radiusKm: 5.5 });
      await bump();

      const res = await search({ q: tag }).expect(200);
      expect(names(res)).toEqual(['near', 'mid', 'exact-edge', 'far-in-radius']);
      const d = (res.body.data as { distanceKm: number }[]).map((v) => v.distanceKm);
      expect(d[0]).toBeCloseTo(1, 0);
      expect(d[1]).toBeCloseTo(4, 0);
      expect([...d].sort((a, b) => a - b)).toEqual(d);
    });

    it('respects the 50 km cap and works away from the vendor city centre', async () => {
      const tag = tagSeq();
      await live(tag, 'x', { lat: HERE.lat + km(49), radiusKm: 50 });
      expect(names(await search({ q: tag }).expect(200))).toEqual(['x']);
    });
  });

  describe('filters', () => {
    it('q matches case-insensitively and treats % and _ literally', async () => {
      const tag = tagSeq();
      await live(tag, 'Sparkle Wash');
      await live(tag, '100% Clean_Co');
      await bump();
      expect(names(await search({ q: `${tag.toUpperCase()} sparkle` }).expect(200))).toEqual(['Sparkle Wash']);
      expect(names(await search({ q: `${tag} 100%` }).expect(200))).toEqual(['100% Clean_Co']);
      expect(names(await search({ q: '%' }).expect(200))).toEqual(['100% Clean_Co']); // a bare % is not "match everything"
      expect(names(await search({ q: '% Clean_Co' }).expect(200))).toEqual(['100% Clean_Co']);
      expect(names(await search({ q: 'S_arkle Wash' }).expect(200))).toEqual([]); // _ is not a wildcard (would match "Sparkle Wash")
    });

    it('filters by service type, minimum rating, maximum price and city', async () => {
      const tag = tagSeq();
      await live(tag, 'dry', { ratingAvg: 4.5, items: [{ name: 'Suit', serviceType: 'DRY_CLEAN', price: 1200, categoryId: basics.dryCleanId }] });
      await live(tag, 'wash-cheap', { ratingAvg: 3.2, items: [{ name: 'Shirt', price: 80 }] });
      await live(tag, 'mixed', { ratingAvg: 4.0, items: [{ name: 'Shirt', price: 150 }, { name: 'Coat', serviceType: 'DRY_CLEAN', price: 900, categoryId: basics.dryCleanId }] });
      await bump();

      expect(names(await search({ q: tag, serviceType: 'DRY_CLEAN' }).expect(200)).sort()).toEqual(['dry', 'mixed']);
      expect(names(await search({ q: tag, serviceType: 'IRON_ONLY' }).expect(200))).toEqual([]);
      expect(names(await search({ q: tag, minRating: 4 }).expect(200)).sort()).toEqual(['dry', 'mixed']);
      expect(names(await search({ q: tag, minRating: 4.5 }).expect(200))).toEqual(['dry']);
      // "price" = cheapest item: mixed's cheapest is 150
      expect(names(await search({ q: tag, maxPrice: 100 }).expect(200))).toEqual(['wash-cheap']);
      expect(names(await search({ q: tag, maxPrice: 150 }).expect(200)).sort()).toEqual(['mixed', 'wash-cheap']);
      expect(names(await search({ q: tag, maxPrice: 80 }).expect(200))).toEqual(['wash-cheap']);
      expect(names(await search({ q: tag, maxPrice: 79.99 }).expect(200))).toEqual([]);
      expect(names(await search({ q: tag, cityId: 99999999 }).expect(200))).toEqual([]);
      // the service-type filter only counts ACTIVE items
      await t.prisma.serviceItem.updateMany({ where: { itemName: 'Coat', vendor: { businessName: `${tag} mixed` } }, data: { isActive: false } });
      await bump();
      expect(names(await search({ q: tag, serviceType: 'DRY_CLEAN' }).expect(200))).toEqual(['dry']);
    });

    it('returns card fields, with money as 2-decimal strings', async () => {
      const tag = tagSeq();
      await live(tag, 'card', { ratingAvg: 4.25, items: [{ name: 'Shirt', price: 120.5, turnaroundHours: 24 }, { name: 'Suit', serviceType: 'DRY_CLEAN', price: 900, turnaroundHours: 72 }] });
      const v = (await search({ q: tag }).expect(200)).body.data[0];
      expect(v).toMatchObject({ businessName: `${tag} card`, cityId, minPrice: '120.50', minTurnaroundHours: 24, ratingAvg: 4.25, serviceRadiusKm: 10 });
      expect(v.serviceTypes.sort()).toEqual(['DRY_CLEAN', 'WASH_IRON']);
      expect(JSON.stringify(v)).not.toMatch(/cnic|owner|email|phone/i);
    });
  });

  describe('sorting and pagination', () => {
    const rows = [
      { label: 'a', rating: 4.5, price: 100, d: 1 },
      { label: 'b', rating: 4.5, price: 100, d: 2 },
      { label: 'c', rating: 4.0, price: 80, d: 3 },
      { label: 'd', rating: 4.0, price: 120, d: 3 }, // same distance as c
      { label: 'e', rating: 4.0, price: 80, d: 4 },
      { label: 'f', rating: 3.0, price: 90, d: 5 },
      { label: 'g', rating: 5.0, price: 200, d: 6 },
    ];

    async function seedSorted() {
      const tag = tagSeq();
      const byLabel: Record<string, string> = {};
      for (const r of rows) {
        const v = await live(tag, r.label, { lat: HERE.lat + km(r.d), ratingAvg: r.rating, items: [{ name: 'Shirt', price: r.price }] });
        byLabel[v.vendor.id] = r.label;
      }
      await bump();
      return { tag, byLabel };
    }

    async function allPages(tag: string, sort: string, limit: number) {
      const ids: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard++) {
        const res = await search({ q: tag, sort, limit, ...(cursor ? { cursor } : {}) }).expect(200);
        ids.push(...res.body.data.map((v: { id: string }) => v.id));
        cursor = res.body.meta.nextCursor ?? undefined;
        if (!cursor) break;
      }
      return ids;
    }

    it.each([
      ['distance', (a: (typeof rows)[number], b: (typeof rows)[number]) => a.d - b.d],
      ['rating', (a: (typeof rows)[number], b: (typeof rows)[number]) => b.rating - a.rating],
      ['price', (a: (typeof rows)[number], b: (typeof rows)[number]) => a.price - b.price],
    ])('sorts by %s and pages through every vendor exactly once, ties included', async (sort, cmp) => {
      const { tag, byLabel } = await seedSorted();
      const single = await search({ q: tag, sort, limit: 50 }).expect(200);
      const full = single.body.data.map((v: { id: string }) => v.id) as string[];
      expect(full).toHaveLength(7);

      // order is right on the sort key (ties broken by id, so only compare keys)
      const keyed = full.map((id) => rows.find((r) => r.label === byLabel[id])!);
      for (let i = 1; i < keyed.length; i++) expect(cmp(keyed[i - 1], keyed[i])).toBeLessThanOrEqual(0);

      for (const limit of [1, 2, 3, 7]) {
        const paged = await allPages(tag, sort, limit);
        expect(paged).toEqual(full); // no gaps, no repeats, same order as one big page
      }
    });

    it('only returns a next cursor when there is more', async () => {
      const { tag } = await seedSorted();
      expect((await search({ q: tag, limit: 7 }).expect(200)).body.meta.nextCursor).toBeNull();
      expect((await search({ q: tag, limit: 6 }).expect(200)).body.meta.nextCursor).toEqual(expect.any(String));
    });

    it('rejects a cursor from another sort order or a mangled one', async () => {
      const { tag } = await seedSorted();
      const page = await search({ q: tag, sort: 'rating', limit: 2 }).expect(200);
      const cursor = page.body.meta.nextCursor;
      const wrongSort = await search({ q: tag, sort: 'price', limit: 2, cursor }).expect(400);
      expect(wrongSort.body.error.code).toBe('INVALID_CURSOR');
      await search({ q: tag, cursor: 'garbage' }).expect(400);
      await search({ q: tag, cursor: Buffer.from('{"o":"distance","s":"1; DROP TABLE","i":"x"}').toString('base64url') }).expect(400);
    });
  });

  describe('validation', () => {
    it.each([
      ['no location', {}],
      ['a latitude out of range', { lat: 91, lng: 67 }],
      ['a longitude out of range', { lat: 24, lng: 181 }],
      ['non-numeric coordinates', { lat: 'north', lng: 67 }],
      ['an unknown sort', { lat: 24, lng: 67, sort: 'cheapest' }],
      ['an unknown service type', { lat: 24, lng: 67, serviceType: 'MAGIC' }],
      ['a rating above 5', { lat: 24, lng: 67, minRating: 6 }],
      ['limit 0', { lat: 24, lng: 67, limit: 0 }],
      ['limit 51', { lat: 24, lng: 67, limit: 51 }],
      ['an unknown parameter', { lat: 24, lng: 67, evil: 1 }],
    ])('rejects %s', async (_label, params) => {
      const res = await http.get('/api/v1/vendors').query(params).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('cache and invalidation', () => {
    it('serves repeat searches from Redis, and drops them the moment vendor data changes', async () => {
      const tag = tagSeq();
      const v = await live(tag, 'cached', { items: [{ name: 'Shirt', price: 100 }] });
      await bump();

      expect(names(await search({ q: tag }).expect(200))).toEqual(['cached']);
      expect((await t.redis.keys('disc:*:*')).length).toBeGreaterThan(0);

      // A direct DB change nobody announced stays invisible until the cache expires or is invalidated: proves caching.
      await t.prisma.vendor.update({ where: { id: v.vendor.id }, data: { availability: 'CLOSED' } });
      expect(names(await search({ q: tag }).expect(200))).toEqual(['cached']);

      // Same change through the API announces itself and is visible at once.
      await http.patch('/api/v1/vendor/availability').set(v.owner.auth).send({ availability: 'OPEN' }).expect(200);
      await http.patch('/api/v1/vendor/availability').set(v.owner.auth).send({ availability: 'CLOSED' }).expect(200);
      expect(names(await search({ q: tag }).expect(200))).toEqual([]);
      await http.patch('/api/v1/vendor/availability').set(v.owner.auth).send({ availability: 'OPEN' }).expect(200);
      expect(names(await search({ q: tag }).expect(200))).toEqual(['cached']);
    });

    it('reflects catalog edits (new cheaper item, deactivation) immediately', async () => {
      const tag = tagSeq();
      const v = await live(tag, 'prices', { items: [{ name: 'Shirt', price: 200 }] });
      await bump();
      expect((await search({ q: tag }).expect(200)).body.data[0].minPrice).toBe('200.00');

      const added = await http.post('/api/v1/vendor/catalog/items').set(v.owner.auth).send({ categoryId: basics.washIronId, itemName: 'Socks', serviceType: 'WASH_FOLD', price: 40, turnaroundHours: 24 }).expect(201);
      expect((await search({ q: tag }).expect(200)).body.data[0].minPrice).toBe('40.00');

      await http.patch(`/api/v1/vendor/catalog/items/${added.body.data.id}`).set(v.owner.auth).send({ price: 75.5 }).expect(200);
      expect((await search({ q: tag }).expect(200)).body.data[0].minPrice).toBe('75.50');

      await http.delete(`/api/v1/vendor/catalog/items/${added.body.data.id}`).set(v.owner.auth).expect(204);
      expect((await search({ q: tag }).expect(200)).body.data[0].minPrice).toBe('200.00');

      await http.post('/api/v1/vendor/catalog/import').set(v.owner.auth).send({ items: [{ itemName: 'Shirt', category: 'Wash & Iron', serviceType: 'WASH_IRON', price: 120, turnaroundHours: 48 }] }).expect(200);
      expect((await search({ q: tag }).expect(200)).body.data[0].minPrice).toBe('120.00');
    });

    it('drops a vendor as soon as an admin suspends them and restores them on reactivation', async () => {
      const tag = tagSeq();
      const v = await live(tag, 'moderated');
      const admin = await createAdmin(t);
      await bump();
      expect(names(await search({ q: tag }).expect(200))).toEqual(['moderated']);

      await http.post(`/api/v1/admin/vendors/${v.vendor.id}/suspend`).set(admin.auth).send({ reason: 'Customer complaints' }).expect(200);
      expect(names(await search({ q: tag }).expect(200))).toEqual([]);
      await http.post(`/api/v1/admin/vendors/${v.vendor.id}/reactivate`).set(admin.auth).expect(200);
      await http.patch('/api/v1/vendor/availability').set(v.owner.auth).send({ availability: 'OPEN' }).expect(200);
      expect(names(await search({ q: tag }).expect(200))).toEqual(['moderated']);
    });

    it('reflects opening-hours edits and admin city switches immediately', async () => {
      const tag = tagSeq();
      const v = await live(tag, 'hours', { hours: { opensAt: 0, closesAt: 60 } });
      const admin = await createAdmin(t);
      await bump();
      expect(names(await search({ q: tag }).expect(200))).toEqual([]);

      const allDay = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, opensAt: 0, closesAt: 1440 }));
      await http.put('/api/v1/vendor/hours').set(v.owner.auth).send({ hours: allDay }).expect(200);
      expect(names(await search({ q: tag }).expect(200))).toEqual(['hours']);

      await http.patch(`/api/v1/admin/cities/${cityId}`).set(admin.auth).send({ isActive: false }).expect(200);
      expect(names(await search({ q: tag }).expect(200))).toEqual([]);
      await http.patch(`/api/v1/admin/cities/${cityId}`).set(admin.auth).send({ isActive: true }).expect(200);
      expect(names(await search({ q: tag }).expect(200))).toEqual(['hours']);
    });

    it('still works when Redis is unavailable for caching (falls back to the database)', async () => {
      const tag = tagSeq();
      await live(tag, 'resilient');
      await bump();
      const spy = jest.spyOn(t.redis, 'get').mockRejectedValue(new Error('redis down'));
      try {
        expect(names(await search({ q: tag }).expect(200))).toEqual(['resilient']);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('public vendor page and catalog', () => {
    it('shows an approved vendor with hours, city fee and openNow', async () => {
      const tag = tagSeq();
      const v = await live(tag, 'page', { hours: { opensAt: 540, closesAt: 1260 }, items: [{ name: 'Shirt', price: 120, turnaroundHours: 24 }, { name: 'Suit', serviceType: 'DRY_CLEAN', price: 900, turnaroundHours: 72, categoryId: basics.dryCleanId }] });
      const res = await http.get(`/api/v1/vendors/${v.vendor.id}`).expect(200);
      expect(res.body.data).toMatchObject({
        id: v.vendor.id,
        businessName: `${tag} page`,
        availability: 'OPEN',
        openNow: true,
        minPrice: '120.00',
        minTurnaroundHours: 24,
        city: { id: cityId, timezone: 'Asia/Karachi', deliveryFee: '150.00' },
      });
      expect(res.body.data.hours).toHaveLength(7);
      expect(res.body.data.serviceTypes.sort()).toEqual(['DRY_CLEAN', 'WASH_IRON']);
      expect(JSON.stringify(res.body)).not.toMatch(/cnic|ownerId|owner"/i);
    });

    it('openNow follows availability and the clock', async () => {
      const tag = tagSeq();
      const v = await live(tag, 'now', { hours: { opensAt: 540, closesAt: 1260 } });
      const open = async () => (await http.get(`/api/v1/vendors/${v.vendor.id}`).expect(200)).body.data.openNow;
      expect(await open()).toBe(true);
      clock.set(new Date('2026-10-23T18:30:00Z')); // 23:30 local
      expect(await open()).toBe(false);
      clock.set(NOW);
      await t.prisma.vendor.update({ where: { id: v.vendor.id }, data: { availability: 'BUSY' } });
      expect(await open()).toBe(false);
    });

    it('hides non-approved vendors, unknown ids and junk ids with 404/400', async () => {
      const tag = tagSeq();
      for (const status of ['PENDING', 'REJECTED', 'SUSPENDED'] as const) {
        const v = await live(tag, status, { status });
        await http.get(`/api/v1/vendors/${v.vendor.id}`).expect(404);
        await http.get(`/api/v1/vendors/${v.vendor.id}/catalog`).expect(404);
      }
      await http.get('/api/v1/vendors/00000000-0000-4000-8000-000000000000').expect(404);
      await http.get('/api/v1/vendors/not-a-uuid').expect(400);
    });

    it('groups the active catalog by category with bilingual names and 2-decimal prices', async () => {
      const tag = tagSeq();
      const v = await live(tag, 'catalog', {
        items: [
          { name: 'Shirt', price: 120 },
          { name: 'Trouser', price: 140.5 },
          { name: 'Suit', serviceType: 'DRY_CLEAN', price: 1100, categoryId: basics.dryCleanId },
          { name: 'Hidden', price: 10, isActive: false },
        ],
      });
      await t.prisma.serviceItem.update({ where: { id: v.items[0].id }, data: { itemNameUr: 'قمیض' } });

      const res = await http.get(`/api/v1/vendors/${v.vendor.id}/catalog`).expect(200);
      const cats = res.body.data.categories as { name: string; items: { itemName: string; price: string; itemNameUr: string | null }[] }[];
      expect(res.body.data).toMatchObject({ vendorId: v.vendor.id, currency: 'PKR' });
      expect(cats.map((c) => c.name).sort()).toEqual(['Dry Cleaning', 'Wash & Iron']);
      const wash = cats.find((c) => c.name === 'Wash & Iron')!;
      expect(wash.items.map((i) => i.itemName)).toEqual(['Shirt', 'Trouser']);
      expect(wash.items[0]).toMatchObject({ itemNameUr: 'قمیض', price: '120.00' });
      expect(wash.items[1].price).toBe('140.50');
      expect(cats.find((c) => c.name === 'Dry Cleaning')!.items.map((i) => i.itemName)).toEqual(['Suit']);
      expect(JSON.stringify(res.body)).not.toContain('Hidden');
    });
  });

  it('limits browsing to 120 requests per minute per client', async () => {
    for (let i = 0; i < 120; i++) await search({ limit: 1 }).set('x-forwarded-for', '198.51.100.9').expect(200);
    const res = await search({ limit: 1 }).set('x-forwarded-for', '198.51.100.9').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    await search({ limit: 1 }).set('x-forwarded-for', '198.51.100.10').expect(200);
  });
});
