import { AdminRole } from '@prisma/client';

/**
 * The one place that says which admin sub-roles may use which part of the admin panel.
 * SUPER_ADMIN is allowed everywhere. A route that is open to admins but names no area is SUPER_ADMIN-only,
 * so a forgotten annotation fails closed.
 */
export const ADMIN_AREAS = {
  /** Every admin may manage their own account. */
  self: [AdminRole.OPERATIONS, AdminRole.FINANCE, AdminRole.SUPPORT],
  cities: [AdminRole.OPERATIONS],
  vendors: [AdminRole.OPERATIONS],
  delivery: [AdminRole.OPERATIONS],
  promos: [AdminRole.OPERATIONS],
  announcements: [AdminRole.OPERATIONS],
  orders: [AdminRole.OPERATIONS, AdminRole.SUPPORT],
  complaints: [AdminRole.OPERATIONS, AdminRole.SUPPORT],
  finance: [AdminRole.FINANCE],
  reports: [AdminRole.FINANCE, AdminRole.OPERATIONS],
  analytics: [AdminRole.FINANCE, AdminRole.OPERATIONS],
} as const satisfies Record<string, readonly AdminRole[]>;

export type AdminArea = keyof typeof ADMIN_AREAS;

export function adminMayAccess(adminRole: AdminRole | null | undefined, area: AdminArea | undefined): boolean {
  if (adminRole === AdminRole.SUPER_ADMIN) return true;
  if (!adminRole || !area) return false;
  return (ADMIN_AREAS[area] as readonly AdminRole[]).includes(adminRole);
}
