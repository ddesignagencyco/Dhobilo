import { ExecutionContext } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { OwnershipGuard } from './ownership.guard';
import { RolesGuard } from './roles.guard';

function ctx(user: { id: string; role: Role } | undefined, params: Record<string, string> = {}): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
  } as unknown as ExecutionContext;
}

const reflectorReturning = (value: unknown) =>
  ({ get: () => value, getAllAndOverride: () => value }) as unknown as Reflector;

describe('RolesGuard', () => {
  const user = (role: Role) => ({ id: 'u1', role, adminRole: role === Role.ADMIN ? ('SUPER_ADMIN' as const) : null, sessionId: 's1' });

  it('allows any authenticated user when no roles are required', () => {
    expect(new RolesGuard(reflectorReturning(undefined)).canActivate(ctx(user(Role.CUSTOMER)))).toBe(true);
  });

  it.each([
    [Role.VENDOR_OWNER, [Role.VENDOR_OWNER, Role.VENDOR_STAFF], true],
    [Role.VENDOR_STAFF, [Role.VENDOR_OWNER, Role.VENDOR_STAFF], true],
    [Role.CUSTOMER, [Role.VENDOR_OWNER, Role.VENDOR_STAFF], false],
    [Role.RIDER, [Role.ADMIN], false],
    [Role.ADMIN, [Role.ADMIN], true],
  ])('%s against %j -> %s', (role, required, allowed) => {
    const guard = new RolesGuard(reflectorReturning(required));
    if (allowed) expect(guard.canActivate(ctx(user(role)))).toBe(true);
    else expect(() => guard.canActivate(ctx(user(role)))).toThrow(/access/);
  });
});

describe('OwnershipGuard', () => {
  const meta = { resolver: class {}, param: 'id' };
  const guardWith = (allowed: string[] | null) =>
    new OwnershipGuard(reflectorReturning(meta), {
      get: () => ({ allowedUserIds: async () => allowed }),
    } as unknown as ModuleRef);

  it('lets the owner through', async () => {
    await expect(guardWith(['u1']).canActivate(ctx({ id: 'u1', role: Role.CUSTOMER }, { id: 'r1' }))).resolves.toBe(true);
  });

  it('hides other people\'s resources behind a 404', async () => {
    await expect(guardWith(['someone-else']).canActivate(ctx({ id: 'u1', role: Role.CUSTOMER }, { id: 'r1' }))).rejects.toMatchObject({
      status: 404,
    });
  });

  it('404s when the resource does not exist', async () => {
    await expect(guardWith(null).canActivate(ctx({ id: 'u1', role: Role.VENDOR_OWNER }, { id: 'r1' }))).rejects.toMatchObject({
      status: 404,
    });
  });

  it('lets admins through without resolving ownership', async () => {
    await expect(guardWith([]).canActivate(ctx({ id: 'a1', role: Role.ADMIN }, { id: 'r1' }))).resolves.toBe(true);
  });

  it('ignores handlers without @OwnedBy', async () => {
    const guard = new OwnershipGuard(reflectorReturning(undefined), {} as ModuleRef);
    await expect(guard.canActivate(ctx(undefined))).resolves.toBe(true);
  });
});
