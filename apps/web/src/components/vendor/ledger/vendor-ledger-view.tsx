'use client';

import { useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowDownLeftIcon, ArrowUpRightIcon, ReceiptTextIcon, ScaleIcon } from 'lucide-react';
import { formatMoney, fromPaisa, toPaisa } from '@dhoblio/shared';
import { ErrorState } from '@/components/admin/states';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { type LedgerType, useVendorLedger } from '@/lib/vendor/hooks/use-vendor-earnings';

const FILTERS: ('ALL' | LedgerType)[] = ['ALL', 'ORDER_EARNING', 'COMMISSION', 'PAYOUT', 'ADJUSTMENT', 'REFUND'];
const PAGE = 25;

const TYPE_VARIANT: Record<LedgerType, BadgeVariant> = {
  ORDER_EARNING: 'success',
  COMMISSION: 'muted',
  PAYOUT: 'info',
  ADJUSTMENT: 'warning',
  REFUND: 'destructive',
};

const asMoney = (n: number) => formatMoney(fromPaisa(Math.round(n * 100)));

function Amount({ value, className }: { value: string; className?: string }) {
  const negative = value.startsWith('-');
  return (
    <span
      className={cn('tabular font-semibold', negative ? 'text-foreground' : 'text-success-text', className)}
      dir="ltr"
    >
      {negative ? '−' : '+'}
      {formatMoney(value.replace('-', ''))}
    </span>
  );
}

export function VendorLedgerView() {
  const t = useTranslations('vendor.ledger');
  const format = useFormatter();
  const { data, isLoading, error, refetch } = useVendorLedger();
  const [filter, setFilter] = useState<'ALL' | LedgerType>('ALL');
  const [shown, setShown] = useState(PAGE);

  const rows = useMemo(() => (data ?? []).filter((e) => filter === 'ALL' || e.type === filter), [data, filter]);
  const sums = useMemo(() => {
    let credit = 0;
    let debit = 0;
    for (const e of rows) {
      const p = toPaisa(e.amount);
      if (p >= 0) credit += p;
      else debit += -p;
    }
    return { credit: credit / 100, debit: debit / 100, net: (credit - debit) / 100 };
  }, [rows]);

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-5">
      <section className="stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label={t('summaryIn')}
          value={<AnimatedNumber value={sums.credit} format={asMoney} />}
          icon={<ArrowDownLeftIcon />}
        />
        <StatTile
          label={t('summaryOut')}
          value={<AnimatedNumber value={sums.debit} format={asMoney} />}
          icon={<ArrowUpRightIcon />}
        />
        <StatTile
          label={t('summaryNet')}
          value={<AnimatedNumber value={sums.net} format={asMoney} />}
          icon={<ScaleIcon />}
        />
      </section>

      <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <div role="tablist" aria-label={t('title')} className="bg-muted inline-flex gap-1 rounded-xl p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => {
                setFilter(f);
                setShown(PAGE);
              }}
              className={cn(
                'min-h-9 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-all duration-200',
                filter === f
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`type.${f}`)}
            </button>
          ))}
        </div>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={<ReceiptTextIcon aria-hidden />}
            title={t('empty')}
            description={t('emptyHint')}
            className="m-5 border-transparent"
          />
        ) : (
          <>
            <ul className="divide-y sm:hidden">
              {rows.slice(0, shown).map((e) => (
                <li key={e.id} className="animate-fade flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <Badge variant={TYPE_VARIANT[e.type]}>{t(`type.${e.type}`)}</Badge>
                    <p className="text-muted-foreground truncate text-xs">{e.note ?? '—'}</p>
                    <p className="text-muted-foreground text-xs">{when(e.createdAt)}</p>
                  </div>
                  <Amount value={e.amount} className="shrink-0 text-base" />
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead>{t('typeLabel')}</TableHead>
                    <TableHead>{t('note')}</TableHead>
                    <TableHead className="text-end">{t('amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:animate-fade">
                  {rows.slice(0, shown).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{when(e.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant={TYPE_VARIANT[e.type]}>{t(`type.${e.type}`)}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.note ?? '—'}</TableCell>
                      <TableCell className="text-end">
                        <Amount value={e.amount} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {rows.length > shown ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
