'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { BanknoteIcon, BarChart3Icon, PercentIcon, ReceiptTextIcon, ShoppingBagIcon, WalletIcon } from 'lucide-react';
import { formatMoney, fromPaisa, toPaisa } from '@dhoblio/shared';
import { ErrorState } from '@/components/admin/states';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { type EarningsRange, type VendorEarnings, useVendorEarnings } from '@/lib/vendor/hooks/use-vendor-earnings';

const rupees = (amount: string) => toPaisa(amount) / 100;
const asMoney = (n: number) => formatMoney(fromPaisa(Math.round(n * 100)));

function Money({ amount }: { amount: string }) {
  return <AnimatedNumber value={rupees(amount)} format={asMoney} />;
}

function bucketOf(iso: string, range: EarningsRange, locale: string): { key: string; label: string } {
  const d = new Date(iso);
  const tag = locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK';
  if (range === 'day') {
    const hour = new Intl.DateTimeFormat(tag, { hour: 'numeric', hour12: true, timeZone: 'Asia/Karachi' }).format(d);
    return { key: hour, label: hour };
  }
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(d);
  const label = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' }).format(d);
  return { key, label };
}

function EarningsChart({ data, range }: { data: VendorEarnings; range: EarningsRange }) {
  const t = useTranslations('vendor.earnings');
  const locale = useLocale();
  const [readyFor, setReadyFor] = useState('');

  const bars = useMemo(() => {
    const map = new Map<string, { label: string; paisa: number; orders: number }>();
    for (const o of [...data.orders].sort((a, b) => a.deliveredAt.localeCompare(b.deliveredAt))) {
      const { key, label } = bucketOf(o.deliveredAt, range, locale);
      const row = map.get(key) ?? { label, paisa: 0, orders: 0 };
      row.paisa += toPaisa(o.net);
      row.orders += 1;
      map.set(key, row);
    }
    return [...map.values()];
  }, [data.orders, range, locale]);

  const signature = bars.map((b) => `${b.label}:${b.paisa}`).join('|');
  const ready = readyFor === signature;

  useEffect(() => {
    const id = requestAnimationFrame(() => setReadyFor(signature));
    return () => cancelAnimationFrame(id);
  }, [signature]);

  const max = Math.max(1, ...bars.map((b) => b.paisa));

  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t('trendTitle')}</h2>
        <span className="text-muted-foreground text-xs">{t('trendHint')}</span>
      </div>
      {bars.length === 0 ? (
        <EmptyState icon={<BarChart3Icon aria-hidden />} title={t('empty')} className="border-transparent py-8" />
      ) : (
        <div
          role="img"
          aria-label={t('trendTitle')}
          className="grid h-52 items-end gap-2"
          style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
        >
          {bars.map((b, i) => (
            <div key={b.label + i} className="group flex h-full min-w-0 flex-col items-center justify-end gap-1.5">
              <span
                className={cn(
                  'tabular text-muted-foreground text-[10px] transition-opacity group-hover:opacity-100',
                  bars.length > 8 && 'opacity-0',
                )}
              >
                {formatMoney(fromPaisa(b.paisa), { decimals: false })}
              </span>
              <div
                className="bg-chart-1 hover:bg-chart-1/80 w-full max-w-10 min-w-2 rounded-t-md transition-[height,background-color] duration-700 ease-[var(--ease-out)]"
                style={{
                  height: ready ? `${Math.max(4, (b.paisa / max) * 100)}%` : '0%',
                  transitionDelay: `${i * 40}ms`,
                }}
                title={`${b.label} · ${formatMoney(fromPaisa(b.paisa))} · ${t('ordersCount', { count: b.orders })}`}
              />
              <span className="text-muted-foreground w-full truncate text-center text-[10px]">{b.label}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function VendorEarningsDashboard() {
  const t = useTranslations('vendor.earnings');
  const format = useFormatter();
  const [range, setRange] = useState<EarningsRange>('week');
  const { data, isLoading, error, refetch } = useVendorEarnings(range);
  const ranges: EarningsRange[] = ['day', 'week', 'month'];

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label={t('title')} className="bg-muted inline-grid grid-cols-3 gap-1 rounded-xl p-1">
        {ranges.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={range === r}
            onClick={() => setRange(r)}
            className={cn(
              'min-h-9 rounded-lg px-4 text-sm font-medium transition-all duration-200',
              range === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(r)}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-40 rounded-xl lg:col-span-2" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <>
          <section aria-label={t('balance')} className="stagger grid gap-4 lg:grid-cols-3">
            <Card className="bg-accent/50 border-primary/20 gap-3 p-6 lg:col-span-2">
              <p className="text-muted-foreground text-sm font-medium">{t('net')}</p>
              <p className="tabular text-4xl leading-none font-semibold tracking-tight" dir="ltr">
                <Money amount={data.totals.net} />
              </p>
              <p className="text-muted-foreground text-sm">
                {t('heroHint', {
                  orders: data.totals.orders,
                  gross: formatMoney(data.totals.gross),
                  commission: formatMoney(data.totals.commission),
                })}
              </p>
            </Card>
            <Card className="gap-3 p-6">
              <p className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <WalletIcon className="size-4" aria-hidden />
                {t('balanceAvailable')}
              </p>
              <p className="tabular text-3xl leading-none font-semibold tracking-tight" dir="ltr">
                <Money amount={data.balance.available} />
              </p>
              <p className="text-muted-foreground text-sm">
                {t('balancePending')}: <span className="tabular">{formatMoney(data.balance.pending)}</span>
              </p>
            </Card>
          </section>

          <section aria-label={t('periodTotals')} className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label={t('orders')}
              value={<AnimatedNumber value={data.totals.orders} />}
              icon={<ShoppingBagIcon />}
            />
            <StatTile label={t('gross')} value={<Money amount={data.totals.gross} />} icon={<ReceiptTextIcon />} />
            <StatTile
              label={t('commission')}
              value={<Money amount={data.totals.commission} />}
              icon={<PercentIcon />}
            />
            <StatTile
              label={t('awaitingCash')}
              value={<Money amount={data.balance.awaitingCash.amount} />}
              hint={t('awaitingCashOrders', { count: data.balance.awaitingCash.orders })}
              icon={<BanknoteIcon />}
            />
          </section>

          <EarningsChart data={data} range={range} />

          <Card className="gap-0 overflow-hidden p-0">
            <h2 className="px-5 pt-5 pb-3 text-base font-semibold">{t('deliveredOrders')}</h2>
            {data.orders.length === 0 ? (
              <EmptyState
                icon={<ReceiptTextIcon aria-hidden />}
                title={t('empty')}
                className="m-5 mt-0 border-transparent py-8"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('order')}</TableHead>
                      <TableHead>{t('delivered')}</TableHead>
                      <TableHead className="text-end">{t('subtotal')}</TableHead>
                      <TableHead className="text-end">{t('commission')}</TableHead>
                      <TableHead className="text-end">{t('net')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr]:animate-fade">
                    {data.orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="tabular font-medium" dir="ltr">
                          {o.orderNo}
                        </TableCell>
                        <TableCell>{format.dateTime(new Date(o.deliveredAt), { dateStyle: 'medium' })}</TableCell>
                        <TableCell className="tabular text-end" dir="ltr">
                          {formatMoney(o.subtotal)}
                        </TableCell>
                        <TableCell className="tabular text-muted-foreground text-end" dir="ltr">
                          −{formatMoney(o.commission)}
                        </TableCell>
                        <TableCell className="tabular text-end font-semibold" dir="ltr">
                          {formatMoney(o.net)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
