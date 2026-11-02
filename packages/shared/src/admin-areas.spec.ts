import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_AREAS, SUPER_ADMIN_ONLY_AREAS, adminMayAccess } from './admin-areas';
import { AdminRole } from './enums';

const API_MATRIX = resolve(__dirname, '../../../apps/api/src/common/auth/admin-permissions.ts');

/**
 * This file only hides navigation; the API enforces the real rule. But a mirror that quietly drifts is
 * worse than no mirror: staff would see links that 403, or — the one that actually matters — a FINANCE
 * admin would be shown a link the API has since opened to them while the panel still hides it.
 */
describe('admin area mirror', () => {
  const source = readFileSync(API_MATRIX, 'utf8');

  /** Parses the API's `area: [AdminRole.X, AdminRole.Y],` lines out of its ADMIN_AREAS object. */
  function apiMatrix(): Map<string, string[]> {
    const block = /export const ADMIN_AREAS = \{([\s\S]*?)\} as const satisfies/.exec(source);
    if (!block) throw new Error('Could not find ADMIN_AREAS in the API source');
    const out = new Map<string, string[]>();
    for (const line of block[1].split('\n')) {
      const m = /^\s*(\w+):\s*\[([^\]]*)\]/.exec(line);
      if (!m) continue;
      const roles = [...m[2].matchAll(/AdminRole\.(\w+)/g)].map(([, r]) => r);
      out.set(m[1], roles);
    }
    return out;
  }

  const api = apiMatrix();

  it('found the API matrix', () => {
    expect(api.size).toBeGreaterThan(5);
  });

  it('covers exactly the same areas as the API', () => {
    expect(Object.keys(ADMIN_AREAS).sort()).toEqual([...api.keys()].sort());
  });

  it.each([...api.keys()])('grants %s to the same roles as the API', (area) => {
    const mine = [...(ADMIN_AREAS[area as keyof typeof ADMIN_AREAS] as readonly string[])].sort();
    expect(mine).toEqual([...api.get(area)!].sort());
  });

  it('does not claim a super-admin-only area is a normal one', () => {
    for (const area of SUPER_ADMIN_ONLY_AREAS) {
      expect(api.has(area)).toBe(false);
      expect(area in ADMIN_AREAS).toBe(false);
    }
  });
});

describe('adminMayAccess', () => {
  it('lets a super admin everywhere, including the areas with no matrix entry', () => {
    expect(adminMayAccess(AdminRole.SUPER_ADMIN, 'finance')).toBe(true);
    expect(adminMayAccess(AdminRole.SUPER_ADMIN, 'audit')).toBe(true);
    expect(adminMayAccess(AdminRole.SUPER_ADMIN, 'admins')).toBe(true);
  });

  it('keeps finance out of operations and operations out of finance', () => {
    expect(adminMayAccess(AdminRole.FINANCE, 'finance')).toBe(true);
    expect(adminMayAccess(AdminRole.FINANCE, 'vendors')).toBe(false);
    expect(adminMayAccess(AdminRole.OPERATIONS, 'vendors')).toBe(true);
    expect(adminMayAccess(AdminRole.OPERATIONS, 'finance')).toBe(false);
  });

  it('gives support orders and complaints but nothing else', () => {
    expect(adminMayAccess(AdminRole.SUPPORT, 'orders')).toBe(true);
    expect(adminMayAccess(AdminRole.SUPPORT, 'complaints')).toBe(true);
    expect(adminMayAccess(AdminRole.SUPPORT, 'finance')).toBe(false);
    expect(adminMayAccess(AdminRole.SUPPORT, 'promos')).toBe(false);
    expect(adminMayAccess(AdminRole.SUPPORT, 'analytics')).toBe(false);
  });

  it('fails closed on a missing role or area', () => {
    expect(adminMayAccess(null, 'orders')).toBe(false);
    expect(adminMayAccess(undefined, 'orders')).toBe(false);
    expect(adminMayAccess(AdminRole.OPERATIONS, undefined)).toBe(false);
  });

  it('keeps audit, queues and admins to the super admin', () => {
    for (const role of [AdminRole.OPERATIONS, AdminRole.FINANCE, AdminRole.SUPPORT]) {
      for (const area of SUPER_ADMIN_ONLY_AREAS) {
        expect(adminMayAccess(role, area)).toBe(false);
      }
    }
  });
});
