import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import request from 'supertest';
import { TestApp, clearRateLimits, createAdmin, createCustomer, createTestApp, prepareReferenceData } from './helpers';
import { waitFor } from './order-helpers';

describe('Audit log API (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let other: Awaited<ReturnType<typeof createAdmin>>;
  const ENTITY = `AuditProbe${randomUUID().slice(0, 6)}`;
  const A = randomUUID();
  const B = randomUUID();

  const get = (query: string, auth = admin.auth) => http.get(`/api/v1/admin/audit-logs?${query}`).set(auth);
  const row = (n: number, d: { entityId: string; action: string; actorId: string; actorRole?: Role; at: string; after?: object }) =>
    t.prisma.auditLog.create({
      data: { entity: ENTITY, entityId: d.entityId, action: d.action, actorId: d.actorId, actorRole: d.actorRole ?? Role.ADMIN, createdAt: new Date(d.at), after: d.after ?? { n }, ip: '203.0.113.7', requestId: `req-${n}` },
    });

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
    await prepareReferenceData(t);
    admin = await createAdmin(t);
    other = await createAdmin(t);
    // five events on two records, by two admins, over three days
    await row(1, { entityId: A, action: 'PROBE_CREATED', actorId: admin.user.id, at: '2025-03-10T08:00:00Z' });
    await row(2, { entityId: A, action: 'PROBE_APPROVED', actorId: other.user.id, at: '2025-03-10T09:00:00Z' });
    await row(3, { entityId: B, action: 'PROBE_CREATED', actorId: admin.user.id, at: '2025-03-11T08:00:00Z' });
    await row(4, { entityId: B, action: 'PROBE_REJECTED', actorId: other.user.id, at: '2025-03-12T08:00:00Z' });
    await row(5, { entityId: A, action: 'PROBE_PAID', actorId: admin.user.id, at: '2025-03-12T09:30:00Z' });
  });
  beforeEach(() => clearRateLimits(t.redis));
  afterAll(() => t.close());

  const ids = (res: request.Response) => res.body.data.map((r: { after: { n: number } }) => r.after.n);

  it('lists newest first with who did it', async () => {
    const res = await get(`entity=${ENTITY}`).expect(200);
    expect(ids(res)).toEqual([5, 4, 3, 2, 1]);
    expect(res.body.data[0]).toMatchObject({
      action: 'PROBE_PAID',
      entity: ENTITY,
      entityId: A,
      actor: { id: admin.user.id, role: 'ADMIN' },
      actorRole: 'ADMIN',
      ip: '203.0.113.7',
      requestId: 'req-5',
      createdAt: '2025-03-12T09:30:00.000Z',
    });
    expect(res.body.meta.nextCursor).toBeNull();
  });

  it('answers "what happened to this record?" and "what did this person do?"', async () => {
    expect(ids(await get(`entity=${ENTITY}&entityId=${A}`).expect(200))).toEqual([5, 2, 1]);
    expect(ids(await get(`entity=${ENTITY}&actorId=${other.user.id}`).expect(200))).toEqual([4, 2]);
    expect(ids(await get(`entity=${ENTITY}&action=PROBE_CREATED`).expect(200))).toEqual([3, 1]);
    expect(ids(await get(`entity=${ENTITY}&actorRole=CUSTOMER`).expect(200))).toEqual([]);
  });

  it('filters by time, inclusive at both ends', async () => {
    expect(ids(await get(`entity=${ENTITY}&from=2025-03-11T00:00:00Z`).expect(200))).toEqual([5, 4, 3]);
    expect(ids(await get(`entity=${ENTITY}&to=2025-03-10T23:59:59Z`).expect(200))).toEqual([2, 1]);
    expect(ids(await get(`entity=${ENTITY}&from=2025-03-10T09:00:00Z&to=2025-03-11T08:00:00Z`).expect(200))).toEqual([3, 2]);
    // Pakistan-time offsets work too: 2025-03-12 13:00 +05:00 is 08:00Z
    expect(ids(await get(`entity=${ENTITY}&from=2025-03-12T13:00:00%2B05:00&to=2025-03-12T13:00:00%2B05:00`).expect(200))).toEqual([4]);
  });

  it('pages without skipping or repeating a row', async () => {
    const first = await get(`entity=${ENTITY}&limit=2`).expect(200);
    expect(ids(first)).toEqual([5, 4]);
    const second = await get(`entity=${ENTITY}&limit=2&cursor=${first.body.meta.nextCursor}`).expect(200);
    expect(ids(second)).toEqual([3, 2]);
    const third = await get(`entity=${ENTITY}&limit=2&cursor=${second.body.meta.nextCursor}`).expect(200);
    expect(ids(third)).toEqual([1]);
    expect(third.body.meta.nextCursor).toBeNull();
  });

  it('keeps rows with the same timestamp apart', async () => {
    const same = ENTITY + 'Same';
    const at = new Date('2025-04-01T10:00:00Z');
    for (let i = 0; i < 4; i++) await t.prisma.auditLog.create({ data: { entity: same, entityId: `e${i}`, action: 'SAME_MOMENT', actorId: admin.user.id, actorRole: Role.ADMIN, createdAt: at } });
    const seen: string[] = [];
    let cursor = '';
    for (;;) {
      const res = await get(`entity=${same}&limit=3${cursor}`).expect(200);
      seen.push(...res.body.data.map((r: { entityId: string }) => r.entityId));
      if (!res.body.meta.nextCursor) break;
      cursor = `&cursor=${res.body.meta.nextCursor}`;
    }
    expect([...seen].sort()).toEqual(['e0', 'e1', 'e2', 'e3']);
  });

  it('shows the real record of an admin action', async () => {
    const created = await http.post('/api/v1/admin/commission-rules').set(admin.auth).send({ scope: 'GLOBAL', ratePct: 12 }).expect(201);
    const entry = await waitFor(async () => (await get(`entity=CommissionRule&entityId=${created.body.data.id}`).expect(200)).body.data[0], 3000, 'the audit entry');
    expect(entry).toMatchObject({ action: 'COMMISSION_RULE_CREATED', actor: { id: admin.user.id }, entityId: created.body.data.id });
    await t.prisma.commissionRule.delete({ where: { id: created.body.data.id } }).catch(() => undefined);
  });

  it('rejects bad filters', async () => {
    for (const q of ['from=yesterday', 'to=2025-13-45', 'actorId=not-a-uuid', 'actorRole=KING', 'limit=0', 'limit=500', 'from=2025-03-12T00:00:00Z&to=2025-03-01T00:00:00Z', 'cursor=garbage']) {
      await get(q).expect(400);
    }
  });

  it('is for admins only', async () => {
    const customer = await createCustomer(t);
    await http.get('/api/v1/admin/audit-logs').expect(401);
    await get('', customer.auth).expect(403);
  });

  it('cannot be edited or deleted, even directly in the database', async () => {
    const [one] = await t.prisma.auditLog.findMany({ where: { entity: ENTITY }, take: 1 });
    await expect(t.prisma.auditLog.update({ where: { id: one.id }, data: { action: 'TAMPERED' } })).rejects.toThrow();
    await expect(t.prisma.auditLog.delete({ where: { id: one.id } })).rejects.toThrow();
  });
});
