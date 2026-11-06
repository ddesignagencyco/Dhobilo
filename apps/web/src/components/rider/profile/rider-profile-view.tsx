'use client';

import { useTransition } from 'react';
import { Banknote, ChevronRight, LogOut, MapPin, Phone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { Link } from '@/i18n/navigation';
import { signOutRider } from '@/lib/rider/actions';
import { useCities, useRiderMe } from '@/lib/rider/hooks';
import { cn } from '@/lib/utils';
import { LocaleSwitch } from '../locale-switch';
import { MoneyCount } from '../money-count';

const STATUS_VARIANT = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'destructive',
  SUSPENDED: 'destructive',
} as const;

export function RiderProfileView() {
  const t = useTranslations('rider.profile');
  const locale = useLocale();
  const me = useRiderMe();
  const cities = useCities();
  const [pending, startTransition] = useTransition();

  const profile = me.data;
  const city = cities.data?.find((c) => c.id === profile?.cityId);
  const cityName = city ? (locale === 'ur' && city.nameUr ? city.nameUr : city.name) : null;

  if (me.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <EmptyState
        title={t('notRegistered')}
        action={
          <Button asChild size="lg">
            <Link href="/rider/register">{t('register')}</Link>
          </Button>
        }
      />
    );
  }

  const capacity = profile.maxActiveJobs > 0 ? Math.min(100, (profile.activeJobs / profile.maxActiveJobs) * 100) : 0;

  return (
    <div className="stagger space-y-5">
      <section className="bg-card flex flex-col items-center gap-3 rounded-3xl border p-6 text-center shadow-xs">
        <span className="bg-primary text-primary-foreground flex size-20 items-center justify-center rounded-full text-3xl font-semibold">
          {profile.name.trim().slice(0, 1).toUpperCase()}
        </span>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">{profile.name}</h2>
          <p className="text-muted-foreground tabular inline-flex items-center gap-1.5 text-sm" dir="ltr">
            <Phone className="size-3.5" aria-hidden />
            {profile.phone}
          </p>
          {cityName ? (
            <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-sm">
              <MapPin className="size-3.5" aria-hidden />
              {cityName}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge variant={STATUS_VARIANT[profile.status]}>{t(`statuses.${profile.status}`)}</Badge>
          <Badge variant={profile.isOnline ? 'success' : 'muted'}>
            {profile.isOnline ? t('online') : t('offline')}
          </Badge>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <StatTile label={t('today')} value={<MoneyCount value={profile.today.earned} />} />
        <StatTile label={t('jobsToday')} value={<AnimatedNumber value={profile.today.jobs} />} />
      </section>

      <section className="bg-card space-y-3 rounded-2xl border p-4 shadow-xs">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t('activeJobs')}</span>
          <span className="tabular text-muted-foreground">
            {profile.activeJobs} / {profile.maxActiveJobs}
          </span>
        </div>
        <div className="bg-muted h-2.5 overflow-hidden rounded-full">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700 ease-[var(--ease-out)]',
              capacity >= 100 ? 'bg-warning' : 'bg-primary',
            )}
            style={{ width: `${capacity}%` }}
          />
        </div>
      </section>

      <section className="bg-card divide-y rounded-2xl border shadow-xs">
        <Link
          href="/rider/cod"
          className="hover:bg-accent/50 flex min-h-14 items-center gap-3 rounded-t-2xl px-4 transition-colors"
        >
          <Banknote className="text-muted-foreground size-5" aria-hidden />
          <span className="flex-1 font-medium">{t('cod')}</span>
          <ChevronRight className="text-muted-foreground size-4 rtl:-scale-x-100" aria-hidden />
        </Link>
        <div className="flex min-h-14 items-center justify-between gap-3 px-4">
          <span className="font-medium">{t('language')}</span>
          <LocaleSwitch />
        </div>
      </section>

      <Button
        variant="outline"
        size="lg"
        className="text-destructive hover:text-destructive h-14 w-full gap-2 text-base"
        disabled={pending}
        onClick={() => startTransition(() => signOutRider(locale))}
      >
        <LogOut className="size-5 rtl:-scale-x-100" aria-hidden />
        {t('logout')}
      </Button>
    </div>
  );
}
