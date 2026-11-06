'use client';

import { Bell, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NAV_BADGE_CAP, type NavBadge, type NavBadgeCounts } from '@/lib/admin/nav';

const ENTRIES: Array<{ key: NavBadge; href: string }> = [
  { key: 'pendingVendors', href: '/admin/vendors' },
  { key: 'pendingRiders', href: '/admin/riders' },
  { key: 'unassignedJobs', href: '/admin/delivery' },
  { key: 'openComplaints', href: '/admin/complaints' },
  { key: 'pendingPayouts', href: '/admin/payouts' },
];

export function NotificationsMenu({ counts }: { counts: NavBadgeCounts }) {
  const t = useTranslations('adminShell');
  const items = ENTRIES.filter((e) => (counts[e.key] ?? 0) > 0);
  const total = items.reduce((sum, e) => sum + (counts[e.key] ?? 0), 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('notifications')}>
          <Bell />
          {total > 0 ? (
            <span className="bg-warning absolute end-1.5 top-1.5 size-2 rounded-full ring-2 ring-[var(--background)]" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t('needsAttention')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2 px-2 py-3 text-sm">
            <CheckCircle2 className="text-success size-4" />
            {t('allCaughtUp')}
          </div>
        ) : (
          items.map((e) => {
            const n = counts[e.key] ?? 0;
            return (
              <DropdownMenuItem key={e.key} asChild>
                <Link href={e.href} className="tabular">
                  {t(e.key, { count: n >= NAV_BADGE_CAP ? `${NAV_BADGE_CAP}+` : n })}
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
