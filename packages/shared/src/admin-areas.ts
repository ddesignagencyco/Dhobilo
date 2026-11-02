import { AdminRole } from './enums';

/**
 * Mirror of apps/api/src/common/auth/admin-permissions.ts.
 *
 * The API is the authority: every admin route is guarded server-side by @AdminAreaOnly. This copy exists
 * only so the panel can hide the navigation an admin cannot use, instead of showing links that 403.
 * Keep the two in step — apps/api/src/common/shared-enums.spec.ts fails if they drift.
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

/**
 * Areas with no entry in ADMIN_AREAS are super-admin only, matching the API's fail-closed rule for a
 * route that names no area. `audit`, `queues` and `admins` deliberately sit here.
 */
export const SUPER_ADMIN_ONLY_AREAS = ['audit', 'queues', 'admins'] as const;
export type SuperAdminOnlyArea = (typeof SUPER_ADMIN_ONLY_AREAS)[number];

export type NavArea = AdminArea | SuperAdminOnlyArea;

/** Same decision the API's adminMayAccess makes, for navigation only. Never rely on this for security. */
export function adminMayAccess(adminRole: AdminRole | null | undefined, area: NavArea | undefined): boolean {
  if (adminRole === AdminRole.SUPER_ADMIN) return true;
  if (!adminRole || !area) return false;
  if (!(area in ADMIN_AREAS)) return false; // super-admin-only area
  return (ADMIN_AREAS[area as AdminArea] as readonly AdminRole[]).includes(adminRole);
}
