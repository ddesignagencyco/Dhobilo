'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ChevronRightIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { ThemeToggle } from '@/components/admin/theme-toggle';
import { Button } from '@/components/ui/button';
import { useVendorProfile } from '@/lib/vendor/hooks/use-vendor-hours';
import { cn } from '@/lib/utils';
import { AvailabilityToggle } from './forms/availability-toggle';
import { ShopAvatar } from './shop-avatar';
import { VendorSidebarNav, activeNavItem } from './sidebar-nav';
import { VendorMobileNav } from './vendor-mobile-nav';
import { type BlockedStatus, VendorStatusScreen } from './vendor-status-screen';
import { VendorUserMenu } from './vendor-user-menu';

const COLLAPSE_KEY = 'dh-vendor-sidebar';
const COLLAPSE_EVENT = 'dh-vendor-sidebar-change';

function subscribe(onChange: () => void) {
  window.addEventListener(COLLAPSE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function useCollapsed(): [boolean, (next: boolean) => void] {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
    () => false,
  );
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      // Storage unavailable: the rail simply will not persist.
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, []);
  return [collapsed, set];
}

const DOT: Record<string, string> = {
  OPEN: 'bg-success',
  BUSY: 'bg-warning',
  CLOSED: 'bg-destructive',
};

function ShopIdentity({ name, collapsed }: { name: string; collapsed: boolean }) {
  const t = useTranslations('vendor.hours');
  const profile = useVendorProfile();
  const availability = profile.data?.availability;

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl',
        collapsed ? 'justify-center p-1' : 'bg-sidebar-accent/60 border-sidebar-border border p-2.5',
      )}
      title={collapsed ? name : undefined}
    >
      <span className="relative">
        <ShopAvatar name={name} />
        {availability ? (
          <span
            aria-hidden
            className={cn(
              'ring-sidebar absolute -end-0.5 -bottom-0.5 size-3 rounded-full ring-2',
              DOT[availability],
              availability === 'OPEN' && 'animate-pulse',
            )}
          />
        ) : null}
      </span>
      {collapsed ? null : (
        <div className="min-w-0">
          <p className="truncate text-sm leading-tight font-semibold">{name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {availability ? t(`availability.${availability}`) : ' '}
          </p>
        </div>
      )}
    </div>
  );
}

/** Vendor app shell: collapsible sidebar on desktop, sheet on mobile, a header that names the current page. */
export function VendorShell({
  children,
  vendorName,
  vendorStatus,
  rejectionReason,
  isOwner,
}: {
  children: React.ReactNode;
  vendorName: string;
  vendorStatus: 'UNREGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  rejectionReason: string | null;
  isOwner: boolean;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useCollapsed();
  const restricted = vendorStatus !== 'APPROVED';
  const onRegister = pathname === '/shop/register' || pathname.startsWith('/shop/register/');
  const canRegisterNow = vendorStatus === 'UNREGISTERED' || vendorStatus === 'REJECTED';
  const showStatus = restricted && !(onRegister && canRegisterNow);
  const current = activeNavItem(pathname);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('dh-theme');
    } catch {
      // Storage unavailable: fall back to the cookie / system preference below.
    }
    const cookieDark = document.cookie.split('; ').includes('dh-theme=dark');
    const dark = stored ? stored === 'dark' : cookieDark || window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
    // Leaving the panel must not leave the customer or login pages dark.
    return () => document.documentElement.classList.remove('dark');
  }, []);

  return (
    <div className="bg-muted/30 min-h-dvh" style={{ ['--sb-w' as string]: collapsed ? '4.5rem' : '16.5rem' }}>
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t('vendor.shell.skipToContent')}
      </a>

      {!restricted ? (
        <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 start-0 z-30 hidden w-[var(--sb-w)] flex-col border-e transition-[width] duration-300 ease-[var(--ease-out)] lg:flex">
          <div
            className={cn(
              'border-sidebar-border flex h-14 shrink-0 items-center gap-2 border-b',
              collapsed ? 'justify-center px-0' : 'px-4',
            )}
          >
            <Link href="/shop/orders" className="flex items-center gap-2.5" aria-label={t('common.appName')}>
              <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-semibold shadow-xs">
                D
              </span>
              {collapsed ? null : <span className="font-semibold tracking-tight">{t('common.appName')}</span>}
            </Link>
            {collapsed ? null : (
              <span className="bg-accent text-accent-foreground ms-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                {t('vendor.panel')}
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <VendorSidebarNav isOwner={isOwner} collapsed={collapsed} />
          </div>

          <div className="border-sidebar-border shrink-0 space-y-2 border-t p-2.5">
            <ShopIdentity name={vendorName} collapsed={collapsed} />
            <Button
              variant="ghost"
              size={collapsed ? 'icon' : 'sm'}
              className={cn('text-muted-foreground w-full', collapsed ? 'mx-auto' : 'justify-start gap-2')}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? t('vendor.shell.expand') : t('vendor.shell.collapse')}
              title={collapsed ? t('vendor.shell.expand') : t('vendor.shell.collapse')}
            >
              {collapsed ? (
                <PanelLeftOpenIcon className="rtl:-scale-x-100" />
              ) : (
                <PanelLeftCloseIcon className="rtl:-scale-x-100" />
              )}
              {collapsed ? null : <span className="text-xs">{t('vendor.shell.collapse')}</span>}
            </Button>
          </div>
        </aside>
      ) : null}

      <div
        className={cn(!restricted && 'transition-[padding] duration-300 ease-[var(--ease-out)] lg:ps-[var(--sb-w)]')}
      >
        <header className="bg-background/85 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-5">
          <VendorMobileNav restricted={restricted} isOwner={isOwner} vendorName={vendorName} />

          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="text-muted-foreground hidden max-w-[16rem] truncate sm:inline" data-testid="vendor-name">
              {vendorName}
            </span>
            {current ? (
              <>
                <ChevronRightIcon className="text-muted-foreground hidden size-3.5 shrink-0 sm:block rtl:-scale-x-100" />
                <span className="truncate font-semibold" aria-current="page">
                  {t(current.labelKey)}
                </span>
              </>
            ) : (
              <span className="truncate font-semibold sm:hidden">{vendorName}</span>
            )}
          </nav>

          <div className="ms-auto flex items-center gap-1.5">
            {vendorStatus === 'APPROVED' ? (
              <div className="hidden sm:block">
                <AvailabilityToggle />
              </div>
            ) : null}
            <ThemeToggle />
            <VendorUserMenu name={vendorName} />
          </div>
        </header>

        {vendorStatus === 'APPROVED' ? (
          <div className="px-3 pt-3 sm:hidden">
            <AvailabilityToggle className="w-full" />
          </div>
        ) : null}

        <main id="main" className="mx-auto w-full max-w-[1600px] p-3 sm:p-6">
          {showStatus ? (
            <VendorStatusScreen status={vendorStatus as BlockedStatus} reason={rejectionReason} isOwner={isOwner} />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
