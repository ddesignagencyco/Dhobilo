'use client';

import { useState } from 'react';
import { BriefcaseBusiness, MapPin, PackageSearch, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { Link, useRouter } from '@/i18n/navigation';
import {
  useRiderAvailableJobs,
  useRiderJobAction,
  useRiderMe,
  useRiderMyJobs,
  useRiderOnlineToggle,
} from '@/lib/rider/hooks';
import { cn } from '@/lib/utils';
import { ActiveJobCard, AvailableJobCard } from '../job/job-card';
import { MoneyCount } from '../money-count';
import { OnlineSlider } from '../online-slider';

const LIMIT = 5;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message === 'LOCATION_UNAVAILABLE') return fallback;
  return error instanceof Error ? error.message : fallback;
}

function HomeSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-52 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}

export function RiderHomeView() {
  const t = useTranslations('rider.home');
  const router = useRouter();

  const me = useRiderMe();
  const isOnline = me.data?.isOnline ?? false;
  const approved = me.data?.status === 'APPROVED';

  const available = useRiderAvailableJobs({ enabled: isOnline && approved });
  const mine = useRiderMyJobs();
  const toggle = useRiderOnlineToggle();
  const action = useRiderJobAction();
  const [showAll, setShowAll] = useState(false);

  if (me.isLoading) return <HomeSkeleton />;

  if (me.isError || !me.data) {
    return (
      <EmptyState
        icon={<BriefcaseBusiness aria-hidden />}
        title={t('notRegistered')}
        action={
          <Button asChild size="lg">
            <Link href="/rider/register">{t('register')}</Link>
          </Button>
        }
      />
    );
  }

  if (!approved) {
    return (
      <EmptyState
        icon={<BriefcaseBusiness aria-hidden />}
        title={t(`application.${me.data.status}`)}
        description={me.data.rejectionReason ?? undefined}
        action={
          <Button asChild variant="outline" size="lg">
            <Link href="/rider/register">{t('viewApplication')}</Link>
          </Button>
        }
      />
    );
  }

  const firstName = me.data.name.trim().split(/\s+/)[0] ?? '';

  const handleToggle = () =>
    toggle.mutate(
      { online: !isOnline },
      {
        onSuccess: () => toast.success(!isOnline ? t('nowOnline') : t('nowOffline')),
        onError: (e) => toast.error(errorMessage(e, t('locationRequired'))),
      },
    );

  const handleAction = (jobId: string, kind: 'claim' | 'accept' | 'decline') =>
    action.mutate(
      { jobId, action: kind },
      {
        onSuccess: () => {
          if (kind !== 'decline') router.push(`/rider/job/${jobId}`);
        },
        onError: (e) => toast.error(errorMessage(e, t('actionFailed'))),
      },
    );

  const myJobs = mine.data ?? [];
  const allJobs = available.data ?? [];
  const jobs = showAll ? allJobs : allJobs.slice(0, LIMIT);
  const pendingId = action.isPending ? action.variables?.jobId : undefined;

  return (
    <div className="space-y-6">
      <section
        className={cn(
          'animate-pop space-y-5 rounded-3xl border p-5 shadow-xs transition-colors duration-500',
          isOnline ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn('text-sm', isOnline ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
              {t('greeting', { name: `\u2068${firstName}\u2069` })}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{isOnline ? t('onlineTitle') : t('offlineTitle')}</h1>
          </div>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold',
              isOnline ? 'bg-white/20' : 'bg-muted text-muted-foreground',
            )}
          >
            <span className="relative flex size-2.5">
              {isOnline ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-70" />
              ) : null}
              <span
                className={cn(
                  'relative inline-flex size-2.5 rounded-full',
                  isOnline ? 'bg-white' : 'bg-muted-foreground/60',
                )}
              />
            </span>
            {isOnline ? t('online') : t('offline')}
          </span>
        </div>

        <OnlineSlider
          online={isOnline}
          pending={toggle.isPending}
          onToggle={handleToggle}
          labelOn={t('slideOnline')}
          labelOff={t('slideOffline')}
        />

        <p
          className={cn(
            'flex items-center gap-2 text-xs',
            isOnline ? 'text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {isOnline ? t('onlineHint') : t('offlineHint')}
        </p>
      </section>

      <section className="stagger grid grid-cols-2 gap-3">
        <StatTile label={t('todayEarned')} value={<MoneyCount value={me.data.today.earned} />} />
        <StatTile
          label={t('todayJobs')}
          value={<AnimatedNumber value={me.data.today.jobs} />}
          hint={t('activeCapacity', { active: me.data.activeJobs, max: me.data.maxActiveJobs })}
        />
      </section>

      {myJobs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t('myJobs')}</h2>
          <div className="stagger space-y-3">
            {myJobs.map((job) => (
              <ActiveJobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t('availableJobs')}</h2>
          {isOnline ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-10 gap-2"
              disabled={available.isFetching}
              onClick={() => void available.refetch()}
            >
              <RefreshCw className={cn('size-4', available.isFetching && 'animate-spin')} aria-hidden />
              {t('refresh')}
            </Button>
          ) : null}
        </div>

        {!isOnline ? (
          <EmptyState
            icon={<PackageSearch aria-hidden />}
            title={t('goOnlineToSee')}
            description={t('goOnlineToSeeHint')}
          />
        ) : available.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-60 rounded-2xl" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState icon={<PackageSearch aria-hidden />} title={t('noJobs')} description={t('noJobsHint')} />
        ) : (
          <div className="stagger space-y-3">
            {jobs.map((job) => (
              <AvailableJobCard
                key={job.id}
                job={job}
                busy={pendingId === job.id}
                onClaim={() => handleAction(job.id, job.status === 'ASSIGNED' ? 'accept' : 'claim')}
                onDecline={() => handleAction(job.id, 'decline')}
              />
            ))}
            {allJobs.length > LIMIT && !showAll ? (
              <Button variant="outline" size="lg" className="h-12 w-full" onClick={() => setShowAll(true)}>
                {t('showMore', { count: allJobs.length - LIMIT })}
              </Button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
