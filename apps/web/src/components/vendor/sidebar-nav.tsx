'use client';

import {
  BarChart3Icon,
  ClockIcon,
  LayoutGridIcon,
  ReceiptTextIcon,
  SettingsIcon,
  ShoppingBagIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export interface VendorNavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
}

export interface VendorNavGroup {
  labelKey: string;
  items: VendorNavItem[];
}

export const VENDOR_NAV_GROUPS: VendorNavGroup[] = [
  {
    labelKey: 'vendor.nav.groupOperations',
    items: [
      { href: '/shop/orders', labelKey: 'vendor.nav.orders', icon: ShoppingBagIcon },
      { href: '/shop/catalog', labelKey: 'vendor.nav.catalog', icon: LayoutGridIcon },
      { href: '/shop/hours', labelKey: 'vendor.nav.hours', icon: ClockIcon },
    ],
  },
  {
    labelKey: 'vendor.nav.groupFinance',
    items: [
      { href: '/shop/earnings', labelKey: 'vendor.nav.earnings', icon: BarChart3Icon },
      { href: '/shop/ledger', labelKey: 'vendor.nav.ledger', icon: ReceiptTextIcon },
      { href: '/shop/payouts', labelKey: 'vendor.nav.payouts', icon: WalletIcon },
    ],
  },
  {
    labelKey: 'vendor.nav.groupShop',
    items: [
      { href: '/shop/staff', labelKey: 'vendor.nav.staff', icon: UsersIcon, ownerOnly: true },
      { href: '/shop/settings', labelKey: 'vendor.nav.profile', icon: SettingsIcon },
    ],
  },
];

export function activeNavItem(pathname: string): VendorNavItem | undefined {
  for (const group of VENDOR_NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item;
    }
  }
  return undefined;
}

export function VendorSidebarNav({
  onNavigate,
  restricted = false,
  isOwner = true,
  collapsed = false,
}: {
  onNavigate?: () => void;
  /** Vendor not yet approved: nothing to navigate to. */
  restricted?: boolean;
  isOwner?: boolean;
  collapsed?: boolean;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  if (restricted) return null;

  const current = activeNavItem(pathname);

  return (
    <nav className={cn('flex flex-col gap-5 py-4', collapsed ? 'px-2' : 'px-3')} aria-label={t('nav.openMenu')}>
      {VENDOR_NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => isOwner || !item.ownerOnly);
        if (items.length === 0) return null;
        return (
          <div key={group.labelKey} className="flex flex-col gap-1">
            {collapsed ? (
              <div aria-hidden className="bg-sidebar-border mx-3 mb-1 h-px first:hidden" />
            ) : (
              <p className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                {t(group.labelKey)}
              </p>
            )}
            {items.map((item) => {
              const active = current?.href === item.href;
              const Icon = item.icon;
              const label = t(item.labelKey);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? label : undefined}
                  title={collapsed ? label : undefined}
                  className={cn(
                    'group relative flex min-h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-200',
                    collapsed ? 'justify-center px-0' : 'px-3',
                    active
                      ? 'bg-sidebar-primary/10 text-sidebar-primary'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'bg-sidebar-primary absolute inset-y-2 start-0 w-[3px] origin-center rounded-full transition-transform duration-300 ease-[var(--ease-spring)]',
                      active ? 'scale-y-100' : 'scale-y-0',
                    )}
                  />
                  <Icon
                    className={cn(
                      'size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110',
                      active && 'scale-105',
                    )}
                  />
                  {collapsed ? null : <span className="flex-1 truncate">{label}</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
