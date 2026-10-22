import { Controller, Get, Injectable, Module, Param } from '@nestjs/common';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AuthUser } from '../src/common/auth/auth-user';
import { OwnedBy, OwnershipResolver } from '../src/common/decorators/owned-by.decorator';
import { Public } from '../src/common/decorators/public.decorator';
import { Roles } from '../src/common/decorators/roles.decorator';
import { TestApp, createTestApp, createUserWithToken } from './helpers';

@Injectable()
class ThingOwnership implements OwnershipResolver {
  /** Test fixture: thing "mine-<userId>" belongs to that user; anything else does not exist. */
  async allowedUserIds(resourceId: string): Promise<string[] | null> {
    return resourceId.startsWith('mine-') ? [resourceId.slice(5)] : null;
  }
}

@Controller('rbac-probe')
class RbacProbeController {
  @Public() @Get('public') pub() { return 'ok'; }
  @Get('any') any() { return 'ok'; }
  @Roles(Role.CUSTOMER) @Get('customer') customer() { return 'ok'; }
  @Roles(Role.VENDOR_OWNER, Role.VENDOR_STAFF) @Get('vendor') vendor() { return 'ok'; }
  @Roles(Role.RIDER) @Get('rider') rider() { return 'ok'; }
  @Roles(Role.ADMIN) @Get('admin') admin() { return 'ok'; }
  @OwnedBy(ThingOwnership) @Get('things/:id') thing(@Param('id') id: string) { return { id }; }
}

@Module({ controllers: [RbacProbeController], providers: [ThingOwnership] })
class RbacProbeModule {}

const ALL_ROLES = [Role.CUSTOMER, Role.VENDOR_OWNER, Role.VENDOR_STAFF, Role.RIDER, Role.ADMIN] as const;

/** route -> roles that may call it (everything else must get 403) */
const MATRIX: Record<string, readonly Role[]> = {
  any: ALL_ROLES,
  customer: [Role.CUSTOMER],
  vendor: [Role.VENDOR_OWNER, Role.VENDOR_STAFF],
  rider: [Role.RIDER],
  admin: [Role.ADMIN],
};

describe('RBAC (e2e)', () => {
  let t: TestApp;
  let http: ReturnType<typeof request>;
  const tokens = {} as Record<Role, { auth: { Authorization: string }; userId: string }>;
  const userIds: string[] = [];

  beforeAll(async () => {
    t = await createTestApp({ imports: [RbacProbeModule] });
    http = request(t.app.getHttpServer());

    for (const role of ALL_ROLES) {
      const u = await createUserWithToken(t, role);
      tokens[role] = { auth: u.auth, userId: u.user.id };
      userIds.push(u.user.id);
    }
  });

  afterAll(async () => {
    await t.prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await t.close();
  });

  it('public routes need no token', async () => {
    await http.get('/api/v1/rbac-probe/public').expect(200);
  });

  it.each(Object.keys(MATRIX))('/%s requires authentication', async (route) => {
    const res = await http.get(`/api/v1/rbac-probe/${route}`).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  for (const [route, allowed] of Object.entries(MATRIX)) {
    for (const role of ALL_ROLES) {
      const expected = allowed.includes(role) ? 200 : 403;
      it(`${role} -> /${route} = ${expected}`, async () => {
        const res = await http.get(`/api/v1/rbac-probe/${route}`).set(tokens[role].auth).expect(expected);
        if (expected === 403) expect(res.body.error.code).toBe('FORBIDDEN');
      });
    }
  }

  describe('ownership', () => {
    it('lets the owner through', async () => {
      const { userId, auth } = tokens[Role.CUSTOMER];
      await http.get(`/api/v1/rbac-probe/things/mine-${userId}`).set(auth).expect(200);
    });

    it('answers 404 (not 403) to other users, so ids cannot be probed', async () => {
      const owner = tokens[Role.CUSTOMER].userId;
      const res = await http.get(`/api/v1/rbac-probe/things/mine-${owner}`).set(tokens[Role.RIDER].auth).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('answers 404 for resources that do not exist', async () => {
      await http.get('/api/v1/rbac-probe/things/ghost').set(tokens[Role.VENDOR_OWNER].auth).expect(404);
    });

    it('lets admins through', async () => {
      const owner = tokens[Role.CUSTOMER].userId;
      await http.get(`/api/v1/rbac-probe/things/mine-${owner}`).set(tokens[Role.ADMIN].auth).expect(200);
    });
  });

  describe('account status', () => {
    it.each(['SUSPENDED', 'DEACTIVATED'] as const)('%s users are blocked even with a valid token', async (status) => {
      const u = await createUserWithToken(t, Role.CUSTOMER, { status });
      userIds.push(u.user.id);
      const res = await http.get('/api/v1/rbac-probe/any').set(u.auth).expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  it('exposes AuthUser typing for handlers (compile-time check)', () => {
    const u: AuthUser = { id: 'x', role: Role.ADMIN, sessionId: 's' };
    expect(u.role).toBe(Role.ADMIN);
  });
});
