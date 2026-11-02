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
}: {
  adminRole: AdminRole | null;
  counts?: NavBadgeCounts;
  onNavigate?: () => void;
}) {
  const t = useTranslations('nav');
  // next-intl's usePathname gives the path with the locale prefix already removed: /admin/vendors.
  const pathname = usePathname();
  const groups = visibleNav(adminRole);
  const active = activeHref(pathname);

  return (
    <nav className="flex flex-col gap-6 p-3" aria-label={t('openMenu')}>
      {groups.map((group, i) => (
        <div key={group.labelKey ?? `group-${i}`} className="flex flex-col gap-1">
          {group.labelKey ? (
            <h2 className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase">
              {t(group.labelKey)}
            </h2>
          ) : null}

          {group.items.map((item) => {
            const isActive = active === item.href;
            const count = item.badge ? counts?.[item.badge] : undefined;
            return (
              <Link
                key={item.href || 'dashboard'}
                href={`/admin${item.href}`}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary/10 text-sidebar-primary'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{t(item.labelKey)}</span>
                {count ? (
                  <Badge variant={isActive ? 'default' : 'warning'} className="tabular">
                    {/* The count comes from a capped probe, so the cap means "at least this many". */}
                    {count >= NAV_BADGE_CAP ? `${NAV_BADGE_CAP}+` : count}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
