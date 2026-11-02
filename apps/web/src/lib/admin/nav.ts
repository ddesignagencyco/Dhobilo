import {
  BadgeDollarSign,
  BarChart3,
  Bike,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  MessageSquareWarning,
  Percent,
  ScrollText,
  Server,
  Store,
  Ticket,
  Truck,
  UserCog,
  Wallet,
} from 'lucide-react';
import { type AdminRole, type NavArea, adminMayAccess } from '@dhoblio/shared';

/**
 * The admin navigation, with the permission area each entry needs.
 *
 * The `area` values come straight from the API's @AdminAreaOnly tags, so what an admin can see matches
 * what they can actually call:
 *   vendors               -> admin-vendors.controller
 *   delivery              -> admin-delivery.controller (riders, dispatch jobs, courier partners)
 *   orders                -> admin-orders.controller
 *   complaints            -> admin-complaints.controller
 *   promos, announcements  -> their own controllers
 *   finance               -> admin-finance.controller (commission, payouts, COD)
 *   analytics, reports     -> analytics / reports controllers
 *   cities                -> admin-cities.controller
 *   admins, audit, queues  -> controllers with no area tag, so super admin only
 *
 * Hiding a link is a courtesy, not a control. The API rejects the call regardless.
 */

export interface NavItem {
  /** Path under /[locale]/admin, '' for the dashboard itself. */
  href: string;
  /** Key under `nav` in the message catalogue. */
  labelKey: string;
  icon: LucideIcon;
  area: NavArea;
  /** Show a live count next to the label (pending approvals, open complaints). */
  badge?: 'pendingVendors' | 'pendingRiders' | 'openComplaints' | 'pendingPayouts' | 'unassignedJobs';
}

/** Live counts shown as badges in the sidebar. */
export type NavBadge = NonNullable<NavItem['badge']>;
export type NavBadgeCounts = Partial<Record<NavBadge, number>>;

/**
 * Most of these queues have no count endpoint, so a badge is built by counting a capped page
 * (see lib/admin/counts.ts). At or above the cap the badge reads "20+" rather than claiming a total.
 */
export const NAV_BADGE_CAP = 20;

export interface NavGroup {
  /** Key under `nav`, or null for the ungrouped first entry. */
  labelKey: string | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: null,
    items: [{ href: '', labelKey: 'dashboard', icon: LayoutDashboard, area: 'analytics' }],
  },
  {
    labelKey: 'operations',
    items: [
      { href: '/vendors', labelKey: 'vendors', icon: Store, area: 'vendors', badge: 'pendingVendors' },
      { href: '/riders', labelKey: 'riders', icon: Bike, area: 'delivery', badge: 'pendingRiders' },
      { href: '/orders', labelKey: 'orders', icon: ClipboardList, area: 'orders' },
      { href: '/delivery', labelKey: 'delivery', icon: Truck, area: 'delivery', badge: 'unassignedJobs' },
      {
        href: '/complaints',
        labelKey: 'complaints',
        icon: MessageSquareWarning,
        area: 'complaints',
        badge: 'openComplaints',
      },
    ],
  },
  {
    labelKey: 'money',
    items: [
      { href: '/payouts', labelKey: 'payouts', icon: Wallet, area: 'finance', badge: 'pendingPayouts' },
      { href: '/cod', labelKey: 'cod', icon: BadgeDollarSign, area: 'finance' },
      { href: '/commission', labelKey: 'commission', icon: Percent, area: 'finance' },
    ],
  },
  {
    labelKey: 'growth',
    items: [
      { href: '/promos', labelKey: 'promos', icon: Ticket, area: 'promos' },
      { href: '/announcements', labelKey: 'announcements', icon: Megaphone, area: 'announcements' },
    ],
  },
  {
    labelKey: 'insight',
    items: [
      { href: '/analytics', labelKey: 'analytics', icon: BarChart3, area: 'analytics' },
      { href: '/reports', labelKey: 'reports', icon: FileSpreadsheet, area: 'reports' },
    ],
  },
  {
    labelKey: 'system',
    items: [
      { href: '/cities', labelKey: 'cities', icon: Building2, area: 'cities' },
      { href: '/admins', labelKey: 'admins', icon: UserCog, area: 'admins' },
      { href: '/audit-logs', labelKey: 'auditLogs', icon: ScrollText, area: 'audit' },
      { href: '/queues', labelKey: 'queues', icon: Server, area: 'queues' },
    ],
  },
];

/** The groups this admin can actually use, with empty groups dropped. */
export function visibleNav(adminRole: AdminRole | null): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => adminMayAccess(adminRole, item.area)),
  })).filter((group) => group.items.length > 0);
}

/** Where to send an admin who lands on /admin: the first thing their role can open. */
export function defaultLandingPath(adminRole: AdminRole | null): string {
  const groups = visibleNav(adminRole);
  return groups[0]?.items[0]?.href ?? '';
}

/**
 * Which nav entry to highlight for a given path.
 *
 * `pathname` is what next-intl's usePathname returns: the path with the locale prefix already stripped,
 * e.g. `/admin/vendors/abc`. Longest match wins, so a detail page highlights its section rather than
 * falling back to the dashboard, and the dashboard only matches its own exact path.
 */
export function activeHref(pathname: string): string | null {
  if (!pathname.startsWith('/admin')) return null;
  const rest = pathname.slice('/admin'.length).replace(/\/$/, '');

  const matches = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href))
    .filter((href) => (href === '' ? rest === '' : rest === href || rest.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length);

  return matches[0] ?? null;
}
