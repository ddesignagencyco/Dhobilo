import { Role } from '@prisma/client';
import request from 'supertest';
import { signParams } from '../src/infra/cloudinary/cloudinary.service';
import { TestApp, clearRateLimits, createTestApp, createUserWithToken } from './helpers';

describe('POST /media/sign (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });
  beforeEach(() => clearRateLimits(t.redis));
  afterAll(() => t.close());

  it('requires authentication', async () => {
    await http.post('/api/v1/media/sign').send({ kind: 'vendor-docs' }).expect(401);
  });

  it.each([Role.CUSTOMER, Role.RIDER, Role.VENDOR_STAFF, Role.ADMIN])('is closed to %s', async (role) => {
    const { auth } = await createUserWithToken(t, role);
    await http.post('/api/v1/media/sign').set(auth).send({ kind: 'vendor-docs' }).expect(403);
  });

  it('gives a vendor owner a private-delivery signature scoped to their own folder', async () => {
    const { auth, user } = await createUserWithToken(t, Role.VENDOR_OWNER);
    const res = await http.post('/api/v1/media/sign').set(auth).send({ kind: 'vendor-docs' }).expect(200);
    const d = res.body.data;

    expect(d.folder).toBe(`dhoblio/test/vendors/${user.id}/docs`);
    expect(d.type).toBe('authenticated'); // CNIC/shop documents are never public
    expect(d).toMatchObject({ cloud_name: 'demo', api_key: 'test-key', upload_preset: 'test-preset' });
    expect(d.limits).toEqual({ maxBytes: 5 * 1024 * 1024, formats: ['jpg', 'png', 'webp'] });
    expect(d.signature).toBe(
      signParams({ folder: d.folder, timestamp: d.timestamp, type: 'authenticated', upload_preset: 'test-preset' }, 'test-secret'),
    );
    expect(JSON.stringify(res.body)).not.toContain('test-secret');
  });

  it('gives each vendor a different folder', async () => {
    const a = await createUserWithToken(t, Role.VENDOR_OWNER);
    const b = await createUserWithToken(t, Role.VENDOR_OWNER);
    const fa = (await http.post('/api/v1/media/sign').set(a.auth).send({ kind: 'vendor-docs' })).body.data.folder;
    const fb = (await http.post('/api/v1/media/sign').set(b.auth).send({ kind: 'vendor-docs' })).body.data.folder;
    expect(fa).not.toBe(fb);
  });

  it('rejects unknown kinds and extra fields', async () => {
    const { auth } = await createUserWithToken(t, Role.VENDOR_OWNER);
    await http.post('/api/v1/media/sign').set(auth).send({ kind: 'rider' }).expect(400);
    await http.post('/api/v1/media/sign').set(auth).send({ kind: 'vendor-docs', folder: '../../x' }).expect(400);
  });

  it('limits signing to 30 per hour per user', async () => {
    const { auth } = await createUserWithToken(t, Role.VENDOR_OWNER);
    for (let i = 0; i < 30; i++) await http.post('/api/v1/media/sign').set(auth).send({ kind: 'vendor-docs' }).expect(200);
    await http.post('/api/v1/media/sign').set(auth).send({ kind: 'vendor-docs' }).expect(429);
  });
});
