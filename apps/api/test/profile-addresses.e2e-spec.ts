import { Role } from '@prisma/client';
import request from 'supertest';
import { TestApp, clearRateLimits, createTestApp, createUserWithToken } from './helpers';

const LAHORE_PIN = { lat: 31.5204, lng: 74.3587 };

describe('Profile, devices, cities and addresses (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let cityId: number;
  const userIds: string[] = [];

  const newUser = async (role: Role = Role.CUSTOMER) => {
    const u = await createUserWithToken(t, role);
    userIds.push(u.user.id);
    return u;
  };

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
    await clearRateLimits(t.redis);
    const city = await t.prisma.city.upsert({ where: { name: 'Lahore' }, update: { isActive: true }, create: { name: 'Lahore' } });
    cityId = city.id;
  });

  afterAll(async () => {
    await t.prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await t.close();
  });

  describe('GET/PATCH /me', () => {
    it('returns the profile without sensitive fields', async () => {
      const { auth, user } = await newUser();
      const res = await http.get('/api/v1/me').set(auth).expect(200);
      expect(res.body.data).toMatchObject({ id: user.id, phone: user.phone, role: 'CUSTOMER', locale: 'EN' });
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('updates name and locale (trimmed)', async () => {
      const { auth } = await newUser();
      const res = await http.patch('/api/v1/me').set(auth).send({ name: '  Ayesha Khan ', locale: 'UR' }).expect(200);
      expect(res.body.data).toMatchObject({ name: 'Ayesha Khan', locale: 'UR' });
    });

    it('cannot be used to change role, status, phone or email (mass assignment)', async () => {
      const { auth, user } = await newUser();
      for (const field of [{ role: 'ADMIN' }, { status: 'ACTIVE' }, { phone: '+923009999999' }, { email: 'a@b.co' }]) {
        const res = await http.patch('/api/v1/me').set(auth).send(field).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
      const after = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.role).toBe('CUSTOMER');
    });

    it('rejects invalid values', async () => {
      const { auth } = await newUser();
      await http.patch('/api/v1/me').set(auth).send({ locale: 'FR' }).expect(400);
      await http.patch('/api/v1/me').set(auth).send({ name: '' }).expect(400);
    });
  });

  describe('device tokens', () => {
    const token = (n: string) => `fcm-token-${n}-`.padEnd(40, 'x');

    it('registers, upserts and removes a token', async () => {
      const { auth, user } = await newUser();
      const tk = token('a');
      await http.post('/api/v1/me/devices').set(auth).send({ token: tk, platform: 'android' }).expect(204);
      await http.post('/api/v1/me/devices').set(auth).send({ token: tk, platform: 'web' }).expect(204);
      const rows = await t.prisma.deviceToken.findMany({ where: { token: tk } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId: user.id, platform: 'web' });

      await http.delete('/api/v1/me/devices').set(auth).send({ token: tk }).expect(204);
      expect(await t.prisma.deviceToken.count({ where: { token: tk } })).toBe(0);
    });

    it('moves a token to the newest account that registers it', async () => {
      const a = await newUser();
      const b = await newUser();
      const tk = token('shared');
      await http.post('/api/v1/me/devices').set(a.auth).send({ token: tk, platform: 'android' }).expect(204);
      await http.post('/api/v1/me/devices').set(b.auth).send({ token: tk, platform: 'android' }).expect(204);
      expect((await t.prisma.deviceToken.findUniqueOrThrow({ where: { token: tk } })).userId).toBe(b.user.id);
    });

    it("cannot delete another user's token", async () => {
      const a = await newUser();
      const b = await newUser();
      const tk = token('owned');
      await http.post('/api/v1/me/devices').set(a.auth).send({ token: tk, platform: 'ios' }).expect(204);
      await http.delete('/api/v1/me/devices').set(b.auth).send({ token: tk }).expect(204);
      expect(await t.prisma.deviceToken.count({ where: { token: tk } })).toBe(1);
    });

    it('validates platform', async () => {
      const { auth } = await newUser();
      await http.post('/api/v1/me/devices').set(auth).send({ token: token('p'), platform: 'toaster' }).expect(400);
    });
  });

  describe('GET /cities', () => {
    it('is public and lists active cities only', async () => {
      const inactive = await t.prisma.city.upsert({
        where: { name: 'Atlantis-e2e' },
        update: { isActive: false },
        create: { name: 'Atlantis-e2e', isActive: false },
      });
      const res = await http.get('/api/v1/cities').expect(200);
      const names = res.body.data.map((c: { name: string }) => c.name);
      expect(names).toContain('Lahore');
      expect(names).not.toContain('Atlantis-e2e');
      await t.prisma.city.delete({ where: { id: inactive.id } });
    });
  });

  describe('addresses', () => {
    const body = (extra: object = {}) => ({ label: 'Home', line1: '12 Gulberg Main Blvd', cityId, ...LAHORE_PIN, ...extra });

    it('requires authentication', async () => {
      await http.get('/api/v1/me/addresses').expect(401);
    });

    it('makes the first address the default and keeps later ones non-default', async () => {
      const { auth } = await newUser();
      const first = await http.post('/api/v1/me/addresses').set(auth).send(body()).expect(201);
      const second = await http.post('/api/v1/me/addresses').set(auth).send(body({ label: 'Office' })).expect(201);
      expect(first.body.data.isDefault).toBe(true);
      expect(second.body.data.isDefault).toBe(false);

      const list = await http.get('/api/v1/me/addresses').set(auth).expect(200);
      expect(list.body.data.map((a: { label: string }) => a.label)).toEqual(['Home', 'Office']);
    });

    it('moves the default when another address is made default', async () => {
      const { auth } = await newUser();
      const a = (await http.post('/api/v1/me/addresses').set(auth).send(body()).expect(201)).body.data;
      const b = (await http.post('/api/v1/me/addresses').set(auth).send(body({ label: 'Office' })).expect(201)).body.data;

      await http.patch(`/api/v1/me/addresses/${b.id}`).set(auth).send({ isDefault: true }).expect(200);
      const list = (await http.get('/api/v1/me/addresses').set(auth)).body.data;
      expect(list.filter((x: { isDefault: boolean }) => x.isDefault).map((x: { id: string }) => x.id)).toEqual([b.id]);

      // The default can't be cleared directly; there is always exactly one.
      await http.patch(`/api/v1/me/addresses/${b.id}`).set(auth).send({ isDefault: false }).expect(200);
      const again = (await http.get('/api/v1/me/addresses').set(auth)).body.data;
      expect(again.filter((x: { isDefault: boolean }) => x.isDefault)).toHaveLength(1);
      expect(a.id).not.toBe(b.id);
    });

    it('creating with isDefault demotes the previous default', async () => {
      const { auth } = await newUser();
      await http.post('/api/v1/me/addresses').set(auth).send(body()).expect(201);
      await http.post('/api/v1/me/addresses').set(auth).send(body({ label: 'New', isDefault: true })).expect(201);
      const list = (await http.get('/api/v1/me/addresses').set(auth)).body.data;
      expect(list.filter((x: { isDefault: boolean }) => x.isDefault).map((x: { label: string }) => x.label)).toEqual(['New']);
    });

    it('soft-deletes, hides the address, and promotes a new default', async () => {
      const { auth, user } = await newUser();
      const a = (await http.post('/api/v1/me/addresses').set(auth).send(body()).expect(201)).body.data;
      const b = (await http.post('/api/v1/me/addresses').set(auth).send(body({ label: 'Office' })).expect(201)).body.data;

      await http.delete(`/api/v1/me/addresses/${a.id}`).set(auth).expect(204);

      const list = (await http.get('/api/v1/me/addresses').set(auth)).body.data;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: b.id, isDefault: true });
      const row = await t.prisma.address.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.userId).toBe(user.id);
      await http.patch(`/api/v1/me/addresses/${a.id}`).set(auth).send({ label: 'x' }).expect(404);
    });

    it("hides other users' addresses (read, update, delete all 404)", async () => {
      const owner = await newUser();
      const other = await newUser();
      const a = (await http.post('/api/v1/me/addresses').set(owner.auth).send(body()).expect(201)).body.data;

      expect((await http.get('/api/v1/me/addresses').set(other.auth)).body.data).toEqual([]);
      await http.patch(`/api/v1/me/addresses/${a.id}`).set(other.auth).send({ label: 'mine now' }).expect(404);
      await http.delete(`/api/v1/me/addresses/${a.id}`).set(other.auth).expect(404);
      expect((await t.prisma.address.findUniqueOrThrow({ where: { id: a.id } })).label).toBe('Home');
    });

    it('validates the city, the pin and the payload', async () => {
      const { auth } = await newUser();
      const inactive = await t.prisma.city.upsert({
        where: { name: 'Closed-e2e' },
        update: { isActive: false },
        create: { name: 'Closed-e2e', isActive: false },
      });

      const closed = await http.post('/api/v1/me/addresses').set(auth).send(body({ cityId: inactive.id })).expect(400);
      expect(closed.body.error.code).toBe('CITY_NOT_AVAILABLE');
      await http.post('/api/v1/me/addresses').set(auth).send(body({ cityId: 99999999 })).expect(400);

      const abroad = await http.post('/api/v1/me/addresses').set(auth).send(body({ lat: 51.5, lng: -0.12 })).expect(400);
      expect(abroad.body.error.code).toBe('LOCATION_OUT_OF_RANGE');
      const swapped = await http.post('/api/v1/me/addresses').set(auth).send(body({ lat: 74.3587, lng: 31.5204 })).expect(400);
      expect(['VALIDATION_FAILED', 'LOCATION_OUT_OF_RANGE']).toContain(swapped.body.error.code);

      await http.post('/api/v1/me/addresses').set(auth).send({ cityId, ...LAHORE_PIN }).expect(400); // line1 missing
      await http.post('/api/v1/me/addresses').set(auth).send(body({ userId: 'someone-else' })).expect(400);
      await http.patch('/api/v1/me/addresses/not-a-uuid').set(auth).send({}).expect(400);
      await t.prisma.city.delete({ where: { id: inactive.id } });
    });

    it('caps saved addresses at 20', async () => {
      const { auth } = await newUser();
      for (let i = 0; i < 20; i++) await http.post('/api/v1/me/addresses').set(auth).send(body({ label: `a${i}` })).expect(201);
      const res = await http.post('/api/v1/me/addresses').set(auth).send(body()).expect(422);
      expect(res.body.error.code).toBe('ADDRESS_LIMIT_REACHED');
    });

    it('never ends up with two defaults under concurrent creates', async () => {
      const { auth, user } = await newUser();
      await Promise.all(
        Array.from({ length: 6 }, (_, i) => http.post('/api/v1/me/addresses').set(auth).send(body({ label: `c${i}`, isDefault: true }))),
      );
      expect(await t.prisma.address.count({ where: { userId: user.id, isDefault: true, deletedAt: null } })).toBe(1);
    });
  });
});
