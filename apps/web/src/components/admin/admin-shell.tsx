'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AdminRole } from '@dhoblio/shared';
import { Link, usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { NAV_GROUPS, type NavBadgeCounts, activeHref } from '@/lib/admin/nav';
import { cn } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { MobileNav } from './mobile-nav';
import { NotificationsMenu } from './notifications-menu';
import { SidebarNav } from './sidebar';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

const COLLAPSE_KEY = 'dh-admin-sidebar';
const COLLAPSE_EVENT = 'dh-admin-sidebar-change';

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

function Breadcrumbs() {
  const t = useTranslations('nav');
  const home = useTranslations('adminShell');
  const common = useTranslations('common');
  const pathname = usePathname();
  const href = activeHref(pathname);
  const group = NAV_GROUPS.find((g) => g.items.some((i) => i.href === href));
  const item = group?.items.find((i) => i.href === href);
  const rest = pathname.replace(/\/$/, '').split('/').length - 2 - (href ? href.split('/').filter(Boolean).length : 0);

  return (
    <nav aria-label="Breadcrumb" className="text-muted-foreground hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
      <Link href="/admin" className="hover:text-foreground transition-colors">
        {home('home')}
      </Link>
      {group?.labelKey ? (
        <>
          <ChevronRight className="size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden />
          <span className="truncate">{t(group.labelKey)}</span>
        </>
      ) : null}
      {item ? (
        <>
          <ChevronRight className="size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden />
          {rest > 0 ? (
            <>
              <Link href={`/admin${item.href}`} className="hover:text-foreground truncate transition-colors">
                {t(item.labelKey)}
              </Link>
              <ChevronRight className="size-3.5 shrink-0 rtl:-scale-x-100" aria-hidden />
              <span className="text-foreground truncate font-medium" aria-current="page">
                {common('details')}
              </span>
            </>
          ) : (
            <span className="text-foreground truncate font-medium" aria-current="page">
              {t(item.labelKey)}
            </span>
          )}
        </>
      ) : null}
    </nav>
  );
}

export function AdminShell({
  admin,
  counts,
  appName,
  adminLabel,
  initialDark,
  children,
}: {
  admin: { name: string | null; email: string | null; adminRole: AdminRole | null };
  counts: NavBadgeCounts;
  appName: string;
  adminLabel: string;
  /** The theme the server rendered from the cookie; the effect below keeps <html> (and portals) in step. */
  initialDark: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations('adminShell');
  const [collapsed, setCollapsed] = useCollapsed();

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('dh-theme');
    } catch {
      // Storage unavailable: fall back to the cookie-derived theme / system preference.
    }
    const dark = stored ? stored === 'dark' : initialDark || window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
    // Portals (dialogs, menus) render under <body>, so <html> carries the class too. Leaving the admin area
    // must not leave the customer or login pages dark.
    return () => document.documentElement.classList.remove('dark');
  }, [initialDark]);

  return (
    <div
      className={cn('bg-muted/30 min-h-dvh', initialDark && 'dark')}
      style={{ ['--sb-w' as string]: collapsed ? '4.5rem' : '16rem' }}
    >
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t('skipToContent')}
      </a>

      {/* Sidebar, desktop only. Fixed so long tables scroll under it rather than pushing it away. */}
      <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 start-0 z-30 hidden w-[var(--sb-w)] flex-col border-e transition-[width] duration-300 ease-[var(--ease-out)] lg:flex">
        <div
          className={cn(
            'border-sidebar-border flex h-14 shrink-0 items-center gap-2 border-b',
            collapsed ? 'justify-center px-0' : 'px-4',
          )}
        >
          <Link href="/admin" className="flex items-center gap-2.5" aria-label={appName}>
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-semibold shadow-xs">
              D
            </span>
            {collapsed ? null : <span className="font-semibold tracking-tight">{appName}</span>}
          </Link>
          {collapsed ? null : (
            <span className="bg-accent text-accent-foreground ms-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              {adminLabel}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav adminRole={admin.adminRole} counts={counts} collapsed={collapsed} />
        </div>

        <div className="border-sidebar-border shrink-0 space-y-1 border-t p-2">
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            className={cn('text-muted-foreground w-full', collapsed ? 'mx-auto' : 'justify-start gap-2')}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('expand') : t('collapse')}
            title={collapsed ? t('expand') : t('collapse')}
          >
            {collapsed ? (
              <PanelLeftOpen className="rtl:-scale-x-100" />
            ) : (
              <PanelLeftClose className="rtl:-scale-x-100" />
            )}
            {collapsed ? null : <span className="text-xs">{t('collapse')}</span>}
          </Button>
          <UserMenu
            name={admin.name}
            email={admin.email}
            adminRole={admin.adminRole}
            variant={collapsed ? 'rail' : 'block'}
          />
        </div>
      </aside>

      <div className="transition-[padding] duration-300 ease-[var(--ease-out)] lg:ps-[var(--sb-w)]">
        <header className="bg-background/85 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 backdrop-blur sm:px-5">
          <MobileNav adminRole={admin.adminRole} counts={counts} />
          <Link href="/admin" className="font-semibold lg:hidden">
            {appName}
          </Link>
          <Breadcrumbs />

          <div className="ms-auto flex items-center gap-1">
            <CommandPalette adminRole={admin.adminRole} />
            <NotificationsMenu counts={counts} />
            <ThemeToggle />
            <div className="lg:hidden">
              <UserMenu name={admin.name} email={admin.email} adminRole={admin.adminRole} />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
