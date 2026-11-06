'use client';

import { useEffect, useState } from 'react';
import { Clock, Route as RouteIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import type { DeliveryJob, JobParty } from '@/lib/rider/hooks';
import { cn } from '@/lib/utils';

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

/** "Sat, 8 Nov · 2:00 pm – 3:00 pm". en-PK keeps Latin digits for Urdu riders as well. */
export function formatWindow(job: Pick<DeliveryJob, 'scheduledStart' | 'scheduledEnd'>): string {
  const start = new Date(job.scheduledStart);
  const day = start.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' });
  const from = start.toLocaleTimeString('en-PK', TIME);
  const to = new Date(job.scheduledEnd).toLocaleTimeString('en-PK', TIME);
  return `${day} · ${from} – ${to}`;
}

export function JobTypeChip({ type }: { type: DeliveryJob['jobType'] }) {
  const t = useTranslations('rider.home');
  return <Badge variant={type === 'PICKUP' ? 'info' : 'success'}>{type === 'PICKUP' ? t('pickup') : t('drop')}</Badge>;
}

function RoleLabel({ role }: { role: JobParty['role'] }) {
  const t = useTranslations('rider.job');
  return <>{role === 'CUSTOMER' ? t('roleCustomer') : t('roleShop')}</>;
}

/** Two stops joined by a line: filled dot for where you collect, ring for where you hand over. */
export function JobRoute({ from, to, compact = false }: { from: JobParty; to: JobParty; compact?: boolean }) {
  return (
    <ol className="relative space-y-3">
      <span aria-hidden className="bg-border absolute start-[0.4375rem] top-3 bottom-3 w-px" />
      {[from, to].map((party, i) => (
        <li key={i} className="relative flex gap-3">
          <span
            aria-hidden
            className={cn(
              'relative z-10 mt-1.5 size-3.5 shrink-0 rounded-full border-2',
              i === 0 ? 'border-primary bg-primary' : 'border-primary bg-background',
            )}
          />
          <div className="min-w-0">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              <RoleLabel role={party.role} />
            </p>
            <p className={cn('font-semibold', compact ? 'truncate text-sm' : 'text-base')}>{party.name}</p>
            <p className={cn('text-muted-foreground break-words', compact ? 'line-clamp-1 text-xs' : 'text-sm')}>
              {party.address}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function JobMeta({ job }: { job: DeliveryJob }) {
  const t = useTranslations('rider.home');
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="size-3.5" aria-hidden />
        <span className="tabular">{formatWindow(job)}</span>
      </span>
      {job.distanceKm !== undefined ? (
        <span className="inline-flex items-center gap-1.5">
          <RouteIcon className="size-3.5" aria-hidden />
          <span className="tabular">{t('distanceKm', { km: job.distanceKm.toFixed(1) })}</span>
        </span>
      ) : null}
    </div>
  );
}

/** Time left on an offer. Re-renders once a second; shows nothing when there is no deadline. */
export function OfferCountdown({ until }: { until: string | null }) {
  const t = useTranslations('rider.home');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);

  if (!until) return null;
  const remaining = Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
  if (remaining === 0) return <span className="text-destructive text-xs font-medium">{t('offerExpired')}</span>;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  return (
    <span className={cn('tabular text-xs font-medium', remaining < 60 ? 'text-destructive' : 'text-warning-text')}>
      {t('offerEnds', { time: `${mm}:${ss}` })}
    </span>
  );
}
