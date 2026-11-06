'use client';

import { ArrowRight } from 'lucide-react';
import { formatMoney } from '@dhoblio/shared';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import type { DeliveryJob } from '@/lib/rider/hooks';
import { cn } from '@/lib/utils';
import { JobMeta, JobRoute, JobTypeChip, OfferCountdown } from './job-card-parts';

function CardHeader({ job }: { job: DeliveryJob }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        <JobTypeChip type={job.jobType} />
        <p className="tabular text-muted-foreground text-xs font-medium" dir="ltr">
          {job.order.orderNo}
        </p>
      </div>
      <div className="text-end">
        <p className="tabular text-xl leading-none font-semibold tracking-tight">{formatMoney(job.riderFee)}</p>
        <OfferCountdown until={job.offerExpiresAt} />
      </div>
    </div>
  );
}

/** An open or offered job: big fee, route, and a thumb-sized claim button. */
export function AvailableJobCard({
  job,
  busy,
  onClaim,
  onDecline,
}: {
  job: DeliveryJob;
  busy: boolean;
  onClaim: () => void;
  onDecline: () => void;
}) {
  const t = useTranslations('rider.home');
  const offered = job.status === 'ASSIGNED';
  return (
    <article
      className={cn('bg-card hover-lift space-y-4 rounded-2xl border p-4 shadow-xs', offered && 'border-primary/50')}
    >
      <CardHeader job={job} />
      <JobRoute from={job.from} to={job.to} compact />
      <JobMeta job={job} />
      {offered ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button size="lg" className="h-12 text-base" disabled={busy} onClick={onClaim}>
            {busy ? t('accepting') : t('acceptJob')}
          </Button>
          <Button size="lg" variant="outline" className="h-12" disabled={busy} onClick={onDecline}>
            {t('decline')}
          </Button>
        </div>
      ) : (
        <Button size="lg" className="h-12 w-full text-base" disabled={busy} onClick={onClaim}>
          {busy ? t('accepting') : t('acceptJob')}
        </Button>
      )}
    </article>
  );
}

/** A job you already hold: pinned, tinted, one tap to carry on. */
export function ActiveJobCard({ job }: { job: DeliveryJob }) {
  const t = useTranslations('rider.home');
  const jobT = useTranslations('rider.job');
  return (
    <Link
      href={`/rider/job/${job.id}`}
      className="bg-card border-primary/40 hover-lift group block space-y-4 rounded-2xl border-2 p-4 shadow-xs"
    >
      <CardHeader job={job} />
      <JobRoute from={job.from} to={job.to} compact />
      <div className="flex items-center justify-between gap-3">
        <span className="text-primary text-sm font-semibold">{jobT(`jobStatus.${job.status}`)}</span>
        <span className="bg-primary text-primary-foreground inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform group-active:scale-95">
          {t('continueJob')}
          <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
