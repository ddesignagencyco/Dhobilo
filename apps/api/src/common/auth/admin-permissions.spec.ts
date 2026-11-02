import { AdminRole } from '@prisma/client';
import { ADMIN_AREAS, AdminArea, adminMayAccess } from './admin-permissions';

describe('adminMayAccess', () => {
  const areas = Object.keys(ADMIN_AREAS) as AdminArea[];

  it('lets SUPER_ADMIN into every area, and into routes that name none', () => {
    for (const a of areas) expect(adminMayAccess(AdminRole.SUPER_ADMIN, a)).toBe(true);
    expect(adminMayAccess(AdminRole.SUPER_ADMIN, undefined)).toBe(true);
  });

  it('fails closed: other roles never pass a route with no area, and a missing role never passes', () => {
    for (const r of [AdminRole.OPERATIONS, AdminRole.FINANCE, AdminRole.SUPPORT]) expect(adminMayAccess(r, undefined)).toBe(false);
    for (const a of areas) expect(adminMayAccess(null, a)).toBe(false);
  });

  it('keeps finance away from operations areas and support away from money', () => {
    expect(adminMayAccess(AdminRole.FINANCE, 'finance')).toBe(true);
    expect(adminMayAccess(AdminRole.FINANCE, 'vendors')).toBe(false);
    expect(adminMayAccess(AdminRole.SUPPORT, 'complaints')).toBe(true);
    expect(adminMayAccess(AdminRole.SUPPORT, 'finance')).toBe(false);
    expect(adminMayAccess(AdminRole.OPERATIONS, 'self')).toBe(true);
  });
});
