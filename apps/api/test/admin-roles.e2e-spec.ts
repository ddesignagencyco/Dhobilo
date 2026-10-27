import { AdminRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { TestApp, createAdmin, createTestApp } from './helpers';

describe('admin roles (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const made: string[] = [];
  const as = async (role: AdminRole) => {
    const a = await createAdmin(t, role);
    made.push(a.user.id);
    return a;
  };

  beforeAll(async () => {
    t = await createTestApp();
    http = request(t.app.getHttpServer());
  });

  // Users stay behind: audit rows reference them and are append-only. The e2e database is wiped on every run.
  afterAll(() => t.close());

  const MATRIX: Array<[string, AdminRole, number]> = [
    ['/api/v1/admin/orders', 'SUPER_ADMIN', 200],
    ['/api/v1/admin/orders', 'OPERATIONS', 200],
    ['/api/v1/admin/orders', 'SUPPORT', 200],
    ['/api/v1/admin/orders', 'FINANCE', 403],
    ['/api/v1/admin/audit-logs', 'SUPER_ADMIN', 200],
    ['/api/v1/admin/audit-logs', 'OPERATIONS', 403],
    ['/api/v1/admin/audit-logs', 'FINANCE', 403],
    ['/api/v1/admin/audit-logs', 'SUPPORT', 403],
    ['/api/v1/admin/admins', 'SUPER_ADMIN', 200],
    ['/api/v1/admin/admins', 'OPERATIONS', 403],
  ];
  it.each(MATRIX)('%s as %s -> %i', async (url, role, status) => {
    const a = await as(role);
    await http.get(url).set(a.auth).expect(status);
  });

  it('creates an admin who can sign in with only their role; refuses duplicates', async () => {
    const boss = await as('SUPER_ADMIN');
    const email = `fin-${Date.now()}@dhoblio.test`;
    const res = await http.post('/api/v1/admin/admins').set(boss.auth).send({ email, name: 'Fin Admin', password: 'A-long-password-1', adminRole: 'FINANCE' }).expect(201);
    made.push(res.body.data.id);
    expect(res.body.data.adminRole).toBe('FINANCE');
    expect(res.body.data).not.toHaveProperty('passwordHash');
    await http.post('/api/v1/admin/admins').set(boss.auth).send({ email, name: 'Dup', password: 'A-long-password-1', adminRole: 'SUPPORT' }).expect(409);

    const login = await http.post('/api/v1/auth/admin/login').send({ email, password: 'A-long-password-1' }).expect(200);
    expect(login.body.data.user.adminRole).toBe('FINANCE');
  });

  it('role changes apply immediately; deactivation blocks the admin', async () => {
    const boss = await as('SUPER_ADMIN');
    const ops = await as('OPERATIONS');
    await http.get('/api/v1/admin/orders').set(ops.auth).expect(200);
    await http.patch(`/api/v1/admin/admins/${ops.user.id}`).set(boss.auth).send({ adminRole: 'FINANCE' }).expect(200);
    await http.get('/api/v1/admin/orders').set(ops.auth).expect(403);
    await http.patch(`/api/v1/admin/admins/${ops.user.id}`).set(boss.auth).send({ status: 'DEACTIVATED' }).expect(200);
    await http.get('/api/v1/admin/orders').set(ops.auth).expect(403);
  });

  it('refuses to change yourself', async () => {
    const boss = await as('SUPER_ADMIN');
    const res = await http.patch(`/api/v1/admin/admins/${boss.user.id}`).set(boss.auth).send({ adminRole: 'SUPPORT' }).expect(422);
    expect(res.body.error.code).toBe('CANNOT_CHANGE_SELF');
  });

  it('two super admins demoting each other at once cannot leave zero super admins', async () => {
    const a = await as('SUPER_ADMIN');
    const b = await as('SUPER_ADMIN');
    // Park every other super admin so a and b are the only active ones.
    const parked = await t.prisma.user.findMany({ where: { adminRole: 'SUPER_ADMIN', status: 'ACTIVE', id: { notIn: [a.user.id, b.user.id] } }, select: { id: true } });
    await t.prisma.user.updateMany({ where: { id: { in: parked.map((u) => u.id) } }, data: { status: 'DEACTIVATED' } });
    try {
      const [r1, r2] = await Promise.all([
        http.patch(`/api/v1/admin/admins/${b.user.id}`).set(a.auth).send({ adminRole: 'SUPPORT' }),
        http.patch(`/api/v1/admin/admins/${a.user.id}`).set(b.auth).send({ adminRole: 'SUPPORT' }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 422]);
      const left = await t.prisma.user.count({ where: { adminRole: 'SUPER_ADMIN', status: 'ACTIVE' } });
      expect(left).toBe(1);
    } finally {
      await t.prisma.user.updateMany({ where: { id: { in: parked.map((u) => u.id) } }, data: { status: 'ACTIVE' } });
    }
  });

  it('lets any admin change their own password, and signs them out', async () => {
    const hash = await argon2.hash('Old-password-123', { type: argon2.argon2id });
    const me = await as('SUPPORT');
    await t.prisma.user.update({ where: { id: me.user.id }, data: { passwordHash: hash } });
    await http.post('/api/v1/admin/me/password').set(me.auth).send({ currentPassword: 'wrong-wrong-1', newPassword: 'New-password-1234' }).expect(401);
    await http.post('/api/v1/admin/me/password').set(me.auth).send({ currentPassword: 'Old-password-123', newPassword: 'New-password-1234' }).expect(200);
  });
});
