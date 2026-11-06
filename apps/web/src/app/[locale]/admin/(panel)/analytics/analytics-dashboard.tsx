'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Banknote, Bike, ClipboardList, MessageSquareWarning, Store, Truck, Users, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCount, formatMoney, formatMoneyCompact, fromPaisa, toPaisa } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { CityFilter } from '@/components/admin/filter-bar';
import { StatusBadge } from '@/components/admin/status-badge';
import { ErrorState } from '@/components/admin/states';
import { RankedBarChart, type RankedRow } from '@/components/charts/ranked-bar-chart';
import { StatTile } from '@/components/charts/stat-tile';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { bffData } from '@/lib/api/bff';
import { NAV_BADGE_CAP, type NavBadge, type NavBadgeCounts } from '@/lib/admin/nav';
import type { AdminOrderListItem, AnalyticsOverview, TopVendorsResponse } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { businessDaysAgo, businessToday, formatRelative } from '@/lib/format';

const RANGES = [7, 30, 90] as const;

/** "24 Oct" — short enough that a 30-day axis does not collide. */
function shortDay(iso: string): string {
  const [, month, day] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(day)} ${months[Number(month) - 1] ?? ''}`;
}

const ATTENTION: Array<{ key: NavBadge; href: string; icon: typeof Store }> = [
  { key: 'pendingVendors', href: '/admin/vendors', icon: Store },
  { key: 'pendingRiders', href: '/admin/riders', icon: Bike },
  { key: 'unassignedJobs', href: '/admin/delivery', icon: Truck },
  { key: 'openComplaints', href: '/admin/complaints', icon: MessageSquareWarning },
  { key: 'pendingPayouts', href: '/admin/payouts', icon: Wallet },
];

/** Fractional change against the previous period; null when there is nothing to compare with. */
function delta(now: number, before: number | undefined): number | null {
  if (before === undefined || !Number.isFinite(before) || before === 0) return null;
  return (now - before) / before;
}

function AttentionQueue({ counts }: { counts: NavBadgeCounts }) {
  const t = useTranslations();
  const items = ATTENTION.filter((a) => (counts[a.key] ?? 0) > 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('adminDash.attentionTitle')}</CardTitle>
        <CardDescription>{t('adminDash.attentionSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t('adminDash.attentionClear')}</p>
        ) : (
          <div className="stagger space-y-2">
            {items.map(({ key, href, icon: Icon }) => {
              const n = counts[key] ?? 0;
              return (
                <Link
                  key={key}
                  href={href}
                  className="hover-lift group bg-card flex items-center gap-3 rounded-lg border p-3"
                >
                  <span className="bg-warning/15 text-warning-text flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="tabular font-medium">{n >= NAV_BADGE_CAP ? `${NAV_BADGE_CAP}+` : n}</span>{' '}
                    <span className="text-muted-foreground">
                      {t(`adminShell.${key}`, { count: '' }).replace(/^\s+/, '')}
                    </span>
                  </span>
                  <ArrowRight
                    className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentOrders() {
  const t = useTranslations();
  const orders = useQuery({
    queryKey: ['admin', 'dashboard', 'recent-orders'],
    queryFn: () => bffData<AdminOrderListItem[]>('/admin/orders', { query: { limit: 7 } }),
  });
  const rows = orders.data ?? [];

  return (
    <Card className="h-full gap-0 overflow-hidden pb-0">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t('adminDash.recentOrders')}</CardTitle>
            <CardDescription>{t('adminDash.recentOrdersHint')}</CardDescription>
          </div>
          <Link
            href="/admin/orders"
            className="text-primary inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline"
          >
            {t('adminDash.viewAll')}
            <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
          </Link>
        </div>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('common.orderNumber')}</TableHead>
            <TableHead>{t('common.vendor')}</TableHead>
            <TableHead>{t('common.status')}</TableHead>
            <TableHead className="text-end">{t('common.total')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={4}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                {t('adminDash.noOrders')}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    dir="ltr"
                    className="hover:text-primary tabular font-mono text-xs font-medium hover:underline"
                  >
                    {o.orderNo}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">{formatRelative(o.placedAt)}</p>
                </TableCell>
                <TableCell className="max-w-44 truncate">{o.vendor?.businessName ?? '—'}</TableCell>
                <TableCell>
                  <StatusBadge status={o.status} />
                </TableCell>
                <TableCell className="tabular text-end font-medium">{formatMoney(o.total)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

export function AnalyticsDashboard({ counts }: { counts: NavBadgeCounts }) {
  const t = useTranslations();
  const [days, setDays] = useState<number>(30);
  const [cityId, setCityId] = useState('');

  const range = useMemo(() => ({ from: businessDaysAgo(days - 1), to: businessToday() }), [days]);

  const overview = useQuery({
    queryKey: ['admin', 'analytics', 'overview', { ...range, cityId }],
    queryFn: () =>
      bffData<AnalyticsOverview>('/admin/analytics/overview', {
        query: { from: range.from, to: range.to, cityId: cityId || undefined },
      }),
  });

  const previousRange = useMemo(() => ({ from: businessDaysAgo(days * 2 - 1), to: businessDaysAgo(days) }), [days]);
  const previous = useQuery({
    queryKey: ['admin', 'analytics', 'overview', 'previous', { ...previousRange, cityId }],
    queryFn: () =>
      bffData<AnalyticsOverview>('/admin/analytics/overview', {
        query: { from: previousRange.from, to: previousRange.to, cityId: cityId || undefined },
      }),
  });
  const before = previous.data?.totals;

  const topVendors = useQuery({
    queryKey: ['admin', 'analytics', 'vendors', { ...range, cityId }],
    queryFn: () =>
      bffData<TopVendorsResponse>('/admin/analytics/vendors', {
        query: { from: range.from, to: range.to, cityId: cityId || undefined, limit: 8 },
      }),
  });

  const totals = overview.data?.totals;
  const series = overview.data?.series ?? [];
  const labels = series.map((d) => shortDay(d.day));

  const vendorRows: RankedRow[] = (topVendors.data?.vendors ?? []).map((v) => ({
    id: v.vendorId,
    label: v.businessName,
    value: toPaisa(v.gmv),
    display: formatMoneyCompact(v.gmv),
    detail: t('analytics.vendorDetail', {
      orders: formatCount(v.ordersDelivered),
      gmv: formatMoney(v.gmv),
    }),
  }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" className="bg-muted inline-flex rounded-lg p-1">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-all duration-200',
                days === option
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('analytics.lastDays', { days: option })}
            </button>
          ))}
        </div>
        <CityFilter value={cityId} onChange={setCityId} />
        <span dir="auto" className="text-muted-foreground ms-auto text-xs">
          {t('analytics.rangeNote', { from: range.from, to: range.to })}
        </span>
      </div>

      {overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : null}

      <div className="stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {overview.isLoading || !totals ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
        ) : (
          <>
            <StatTile
              label={t('analytics.ordersDelivered')}
              value={formatCount(totals.ordersDelivered)}
              count={{ value: totals.ordersDelivered, format: (n) => formatCount(Math.round(n)) }}
              delta={delta(totals.ordersDelivered, before?.ordersDelivered)}
              hint={t('adminDash.vsPrevious', { days })}
              icon={<ClipboardList />}
            />
            <StatTile
              label={t('analytics.gmv')}
              value={formatMoneyCompact(totals.gmv)}
              count={{ value: Number(totals.gmv), format: (n) => formatMoneyCompact(n.toFixed(2)) }}
              delta={delta(Number(totals.gmv), before ? Number(before.gmv) : undefined)}
              hint={t('adminDash.vsPrevious', { days })}
              icon={<Banknote />}
            />
            <StatTile
              label={t('analytics.revenue')}
              value={formatMoneyCompact(totals.revenue)}
              count={{ value: Number(totals.revenue), format: (n) => formatMoneyCompact(n.toFixed(2)) }}
              delta={delta(Number(totals.revenue), before ? Number(before.revenue) : undefined)}
              hint={t('adminDash.vsPrevious', { days })}
              icon={<Store />}
            />
            <StatTile
              label={t('analytics.activeCustomers')}
              value={formatCount(totals.activeCustomers)}
              count={{ value: totals.activeCustomers, format: (n) => formatCount(Math.round(n)) }}
              delta={delta(totals.activeCustomers, before?.activeCustomers)}
              hint={t('adminDash.vsPrevious', { days })}
              icon={<Users />}
            />
          </>
        )}
      </div>

      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('analytics.ordersChart')}</CardTitle>
            <CardDescription>{t('analytics.ordersChartHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <TimeSeriesChart
                labels={labels}
                yFormat={(v) => formatCount(v)}
                emptyLabel={t('analytics.noData')}
                series={[
                  {
                    key: 'placed',
                    label: t('analytics.placed'),
                    slot: 1,
                    values: series.map((d) => d.ordersPlaced),
                    format: (v) => formatCount(v),
                  },
                  {
                    key: 'delivered',
                    label: t('analytics.delivered'),
                    slot: 2,
                    values: series.map((d) => d.ordersDelivered),
                    format: (v) => formatCount(v),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <AttentionQueue counts={counts} />
      </div>

      <div className="stagger mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.gmvChart')}</CardTitle>
            {/*
              GMV and commission live in separate charts on purpose. They are both money but an order of
              magnitude apart, so plotting them together would flatten commission onto the baseline — and
              a second y-axis is never the answer.
            */}
            <CardDescription>{t('analytics.gmvChartHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <TimeSeriesChart
                labels={labels}
                area
                yFormat={(v) => formatMoneyCompact(fromPaisa(v))}
                emptyLabel={t('analytics.noData')}
                series={[
                  {
                    key: 'gmv',
                    label: t('analytics.gmv'),
                    slot: 1,
                    // Charted in paisa so the axis maths stays in integers; formatted back to rupees.
                    values: series.map((d) => toPaisa(d.gmv)),
                    format: (v) => formatMoney(fromPaisa(v)),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('analytics.revenueChart')}</CardTitle>
            <CardDescription>{t('analytics.revenueChartHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {overview.isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : (
              <TimeSeriesChart
                labels={labels}
                area
                yFormat={(v) => formatMoneyCompact(fromPaisa(v))}
                emptyLabel={t('analytics.noData')}
                series={[
                  {
                    key: 'revenue',
                    label: t('analytics.revenue'),
                    slot: 1,
                    values: series.map((d) => toPaisa(d.revenue)),
                    format: (v) => formatMoney(fromPaisa(v)),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>

      </div>

      <div className="stagger mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{t('analytics.topVendors')}</CardTitle>
            <CardDescription>{t('analytics.topVendorsHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {topVendors.isError ? (
              <ErrorState error={topVendors.error} onRetry={() => void topVendors.refetch()} />
            ) : topVendors.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <RankedBarChart rows={vendorRows} emptyLabel={t('analytics.noData')} />
            )}
          </CardContent>
        </Card>
        </div>
        <div className="lg:col-span-3">
          <RecentOrders />
        </div>
      </div>
    </>
  );
}
