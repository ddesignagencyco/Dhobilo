'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import {
  ShoppingBagIcon,
  LayoutGridIcon,
  ClockIcon,
  BarChart3Icon,
  DollarSignIcon,
  WalletIcon,
  UsersIcon,
  SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface VendorNavItem {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
}

const VENDOR_NAV_ITEMS: VendorNavItem[] = [
  {
    href: '/shop/orders',
    labelKey: 'vendor.nav.orders',
    icon: <ShoppingBagIcon className="size-4" />,
  },
  {
    href: '/shop/catalog',
    labelKey: 'vendor.nav.catalog',
    icon: <LayoutGridIcon className="size-4" />,
  },
  {
    href: '/shop/hours',
    labelKey: 'vendor.nav.hours',
    icon: <ClockIcon className="size-4" />,
  },
  {
    href: '/shop/earnings',
    labelKey: 'vendor.nav.earnings',
    icon: <BarChart3Icon className="size-4" />,
  },
  {
    href: '/shop/ledger',
    labelKey: 'vendor.nav.ledger',
    icon: <DollarSignIcon className="size-4" />,
  },
  {
    href: '/shop/payouts',
    labelKey: 'vendor.nav.payouts',
    icon: <WalletIcon className="size-4" />,
  },
  {
    href: '/shop/staff',
    labelKey: 'vendor.nav.staff',
    icon: <UsersIcon className="size-4" />,
  },
  {
    href: '/shop/settings',
    labelKey: 'vendor.nav.profile',
    icon: <SettingsIcon className="size-4" />,
  },
];

export function VendorSidebarNav({
  onNavigate,
  restricted = false,
  isOwner = true,
}: {
  onNavigate?: () => void;
  /** Vendor not yet approved: nothing to navigate to. */
  restricted?: boolean;
  isOwner?: boolean;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  // Remove locale prefix from pathname for comparison
  // usePathname from next-intl returns path without locale: /shop/orders
  const currentPath = pathname;

  const items = VENDOR_NAV_ITEMS.filter((item) => isOwner || item.href !== '/shop/staff');

  if (restricted) return null;

  const isActive = (itemHref: string) => {
    // Exact match or starts with for sub-routes
    return currentPath === itemHref || currentPath.startsWith(`${itemHref}/`);
  };

  return (
    <nav className="flex flex-col gap-6 p-3" aria-label={t('nav.openMenu')}>
      <div className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-primary/10 text-sidebar-primary'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              {item.icon}
              <span className="flex-1 truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
