'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import type { AdminRole } from '@dhoblio/shared';
import { Badge } from '@/components/ui/badge';
import { NAV_BADGE_CAP, type NavBadgeCounts, activeHref, visibleNav } from '@/lib/admin/nav';
import { cn } from '@/lib/utils';

export function SidebarNav({
  adminRole,
  counts,
  onNavigate,
  collapsed = false,
}: {
  adminRole: AdminRole | null;
  counts?: NavBadgeCounts;
  onNavigate?: () => void;
  /** Icon-rail mode (desktop only): labels hide, counts become a dot, group titles become hairlines. */
  collapsed?: boolean;
}) {
  const t = useTranslations('nav');
  // next-intl's usePathname gives the path with the locale prefix already removed: /admin/vendors.
  const pathname = usePathname();
  const groups = visibleNav(adminRole);
  const active = activeHref(pathname);

  return (
    <nav className={cn('flex flex-col gap-5 p-3', collapsed && 'items-stretch gap-3')} aria-label={t('openMenu')}>
      {groups.map((group, i) => (
        <div key={group.labelKey ?? `group-${i}`} className="flex flex-col gap-0.5">
          {group.labelKey ? (
            collapsed ? (
              <div className="bg-sidebar-border mx-3 mb-1 h-px" aria-hidden />
            ) : (
              <h2 className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase">
                {t(group.labelKey)}
              </h2>
            )
          ) : null}

          {group.items.map((item) => {
            const isActive = active === item.href;
            const count = item.badge ? counts?.[item.badge] : undefined;
            const label = t(item.labelKey);
            return (
              <Link
                key={item.href || 'dashboard'}
                href={`/admin${item.href}`}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  'group/nav relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color,transform] duration-200',
                  'before:bg-sidebar-primary before:absolute before:start-0 before:top-2 before:bottom-2 before:w-[3px] before:origin-center before:scale-y-0 before:rounded-full before:transition-transform before:duration-300 before:ease-[var(--ease-spring)]',
                  isActive
                    ? 'bg-sidebar-primary/10 text-sidebar-primary before:scale-y-100'
                    : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  collapsed && 'justify-center px-0',
                )}
              >
                <item.icon
                  className={cn(
                    'size-[18px] shrink-0 transition-transform duration-200 group-hover/nav:scale-110',
                    isActive && 'scale-105',
                  )}
                  aria-hidden
                />
                {collapsed ? (
                  <span className="sr-only">{label}</span>
                ) : (
                  <span className="flex-1 truncate">{label}</span>
                )}
                {count ? (
                  collapsed ? (
                    <span className="bg-warning absolute end-2 top-1.5 size-2 rounded-full ring-2 ring-[var(--sidebar)]" />
                  ) : (
                    <Badge variant={isActive ? 'default' : 'warning'} className="tabular">
                      {/* The count comes from a capped probe, so the cap means "at least this many". */}
                      {count >= NAV_BADGE_CAP ? `${NAV_BADGE_CAP}+` : count}
                    </Badge>
                  )
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
