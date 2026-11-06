'use client';

import { CheckIcon, Clock, ShieldAlert, Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export type BlockedStatus = 'UNREGISTERED' | 'PENDING' | 'REJECTED' | 'SUSPENDED';

const TONE: Record<BlockedStatus, string> = {
  UNREGISTERED: 'bg-info/15 text-info-text',
  PENDING: 'bg-warning/20 text-warning-text',
  REJECTED: 'bg-destructive/10 text-destructive',
  SUSPENDED: 'bg-destructive/10 text-destructive',
};

export function VendorStatusScreen({
  status,
  reason,
  isOwner,
}: {
  status: BlockedStatus;
  reason: string | null;
  isOwner: boolean;
}) {
  const t = useTranslations('vendor.shell.status');
  const Icon = status === 'PENDING' ? Clock : status === 'UNREGISTERED' ? Store : ShieldAlert;
  const canRegister = isOwner && (status === 'UNREGISTERED' || status === 'REJECTED');

  return (
    <div className="bg-card animate-pop mx-auto mt-6 flex max-w-lg flex-col items-center gap-4 rounded-2xl border p-8 text-center shadow-xs sm:mt-12">
      <span className={cn('flex size-16 items-center justify-center rounded-2xl', TONE[status])}>
        <Icon className="size-8" aria-hidden />
      </span>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">{t(`${status}.title`)}</h1>
        <p className="text-muted-foreground text-sm">{t(`${status}.body`)}</p>
      </div>

      {status === 'PENDING' ? (
        <ol className="flex w-full items-center justify-between gap-2 pt-2 text-xs" aria-hidden>
          {(['submitted', 'review', 'approved'] as const).map((step, i) => (
            <li key={step} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold',
                  i === 0 && 'border-primary bg-primary text-primary-foreground',
                  i === 1 && 'border-warning bg-warning/20 text-warning-text animate-pulse',
                  i === 2 && 'border-border text-muted-foreground',
                )}
              >
                {i === 0 ? <CheckIcon className="size-4" /> : i + 1}
              </span>
              <span className={cn(i === 2 ? 'text-muted-foreground' : 'text-foreground font-medium')}>
                {t(`progress.${step}`)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {status === 'REJECTED' && reason ? (
        <p className="bg-destructive/5 text-destructive w-full rounded-lg border border-current/20 p-3 text-start text-sm">
          <span className="font-medium">{t('reason')}</span> {reason}
        </p>
      ) : null}
      {canRegister ? (
        <Button asChild size="lg" className="mt-1">
          <Link href="/shop/register">{t(`${status}.cta`)}</Link>
        </Button>
      ) : null}
    </div>
  );
}
