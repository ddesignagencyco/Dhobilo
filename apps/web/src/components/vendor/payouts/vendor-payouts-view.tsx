'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { LandmarkIcon, WalletIcon } from 'lucide-react';
import { formatMoney, fromPaisa, toPaisa } from '@dhoblio/shared';
import { ErrorState } from '@/components/admin/states';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useVendorEarnings } from '@/lib/vendor/hooks/use-vendor-earnings';
import { type PayoutStatus, useVendorPayouts } from '@/lib/vendor/hooks/use-vendor-payouts';
import { PayoutRequestForm } from './payout-request-form';

const STATUS_VARIANT: Record<PayoutStatus, BadgeVariant> = {
  REQUESTED: 'warning',
  APPROVED: 'info',
  PAID: 'success',
  REJECTED: 'destructive',
};

const asMoney = (n: number) => formatMoney(fromPaisa(Math.round(n * 100)));

export function VendorPayoutsView() {
  const t = useTranslations('vendor.payouts');
  const format = useFormatter();
  const earnings = useVendorEarnings('week');
  const payouts = useVendorPayouts();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        {earnings.data ? (
          <Card className="bg-accent/50 border-primary/20 animate-pop gap-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <WalletIcon className="size-4" aria-hidden />
                {t('available')}
              </p>
              <span className="text-muted-foreground text-xs">
                {t('pending')}: <span className="tabular">{formatMoney(earnings.data.balance.pending)}</span>
              </span>
            </div>
            <p className="tabular text-4xl leading-none font-semibold tracking-tight" dir="ltr">
              <AnimatedNumber value={toPaisa(earnings.data.balance.available) / 100} format={asMoney} />
            </p>
          </Card>
        ) : (
          <Skeleton className="h-36 rounded-xl" />
        )}

        {earnings.data ? <PayoutRequestForm available={earnings.data.balance.available} /> : null}
      </div>

      <section className="space-y-3 lg:col-span-2">
        <h2 className="text-base font-semibold">{t('history')}</h2>
        {payouts.error ? (
          <ErrorState error={payouts.error} onRetry={() => void payouts.refetch()} />
        ) : payouts.isLoading || !payouts.data ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : payouts.data.length === 0 ? (
          <EmptyState icon={<LandmarkIcon aria-hidden />} title={t('empty')} description={t('emptyHint')} />
        ) : (
          <ul className="stagger space-y-2.5">
            {payouts.data.map((p) => (
              <li key={p.id}>
                <Card className="hover-lift flex-row items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <LandmarkIcon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="tabular font-semibold" dir="ltr">
                        {formatMoney(p.amount)}
                      </p>
                      <p className="text-muted-foreground tabular truncate text-xs" dir="ltr">
                        {p.accountRef}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {format.dateTime(new Date(p.requestedAt), { dateStyle: 'medium' })}
                        {p.txnRef ? ` · ${p.txnRef}` : ''}
                      </p>
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[p.status]}>{t(`status.${p.status}`)}</Badge>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
