'use client';

import { useState } from 'react';
import { Banknote, HandCoins } from 'lucide-react';
import { formatMoney } from '@dhoblio/shared';
import { useTranslations } from 'next-intl';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useRiderCod } from '@/lib/rider/hooks';
import { MoneyCount } from '../money-count';

const LIMIT = 8;

export function CodCollectionScreen() {
  const t = useTranslations('rider.cod');
  const { data, isLoading, isError } = useRiderCod();
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (isError || !data) return <EmptyState icon={<Banknote aria-hidden />} title={t('error')} />;

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-5 lg:sticky lg:top-24">
        <section className="bg-card animate-pop space-y-3 rounded-3xl border p-6 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm font-medium">{t('cashBalance')}</p>
            <span className="bg-warning/15 text-warning-text flex size-10 items-center justify-center rounded-full">
              <HandCoins className="size-5" aria-hidden />
            </span>
          </div>
          <p className="tabular text-4xl font-semibold tracking-tight">
            <MoneyCount value={data.cashInHand} />
          </p>
          <p className="text-muted-foreground text-sm">
            <AnimatedNumber value={data.unsettledOrders} /> {t('unsettled')}
          </p>
        </section>

        <div className="bg-muted/60 text-muted-foreground max-lg:hidden rounded-2xl p-4 text-xs leading-relaxed">
          <p className="text-foreground mb-1 font-medium">{t('notice')}</p>
          <p>{t('noticeText')}</p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="font-semibold">{t('collectionHistory')}</h3>
        {data.collections.length === 0 ? (
          <EmptyState icon={<Banknote aria-hidden />} title={t('noCash')} />
        ) : (
          <ul className="stagger grid gap-2.5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {(showAll ? data.collections : data.collections.slice(0, LIMIT)).map((entry) => (
              <li
                key={entry.id}
                className="bg-card flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-xs"
              >
                <div className="min-w-0">
                  <p className="tabular font-medium break-words" dir="ltr">
                    {entry.orderNo}
                  </p>
                  <p className="text-muted-foreground tabular text-xs">
                    {new Date(entry.collectedAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <div className="space-y-1 text-end">
                  <p className="tabular font-semibold">{formatMoney(entry.amount)}</p>
                  <Badge variant={entry.settled ? 'success' : 'warning'}>
                    {entry.settled ? t('settled') : t('collected')}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data.collections.length > LIMIT && !showAll ? (
          <Button variant="outline" size="lg" className="h-12 w-full md:w-auto" onClick={() => setShowAll(true)}>
            {t('showMore', { count: data.collections.length - LIMIT })}
          </Button>
        ) : null}
      </section>

      <div className="bg-muted/60 text-muted-foreground rounded-2xl p-4 text-xs leading-relaxed lg:hidden">
        <p className="text-foreground mb-1 font-medium">{t('notice')}</p>
        <p>{t('noticeText')}</p>
      </div>
    </div>
  );
}
