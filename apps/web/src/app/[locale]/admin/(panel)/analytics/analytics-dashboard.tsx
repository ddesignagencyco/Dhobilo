'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, ClipboardList, Store, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatCount, formatMoney, formatMoneyCompact, fromPaisa, toPaisa } from '@dhoblio/shared';
import { CityFilter } from '@/components/admin/filter-bar';
import { ErrorState } from '@/components/admin/states';
import { RankedBarChart, type RankedRow } from '@/components/charts/ranked-bar-chart';
import { StatTile } from '@/components/charts/stat-tile';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { bffData } from '@/lib/api/bff';
import type { AnalyticsOverview, TopVendorsResponse } from '@/lib/api/types';
import { businessDaysAgo, businessToday } from '@/lib/format';

const RANGES = [7, 30, 90] as const;

/** "24 Oct" — short enough that a 30-day axis does not collide. */
function shortDay(iso: string): string {
  const [, month, day] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(day)} ${months[Number(month) - 1] ?? ''}`;
}

export function AnalyticsDashboard() {
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
        <div className="flex gap-1">
          {RANGES.map((option) => (
            <Button
              key={option}
              variant={days === option ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(option)}
            >
              {t('analytics.lastDays', { days: option })}
            </Button>
          ))}
        </div>
        <CityFilter value={cityId} onChange={setCityId} />
        <span className="text-muted-foreground ms-auto text-xs">
          {t('analytics.rangeNote', { from: range.from, to: range.to })}
        </span>
      </div>

      {overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {overview.isLoading || !totals ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : (
          <>
            <StatTile
              label={t('analytics.ordersDelivered')}
              value={formatCount(totals.ordersDelivered)}
              hint={t('analytics.ofPlaced', { placed: formatCount(totals.ordersPlaced) })}
              icon={<ClipboardList className="size-4" />}
            />
            <StatTile
              label={t('analytics.gmv')}
              value={formatMoneyCompact(totals.gmv)}
              hint={t('analytics.gmvHint')}
              icon={<Banknote className="size-4" />}
            />
            <StatTile
              label={t('analytics.revenue')}
              value={formatMoneyCompact(totals.revenue)}
              hint={t('analytics.revenueHint')}
              icon={<Store className="size-4" />}
            />
            <StatTile
              label={t('analytics.activeCustomers')}
              value={formatCount(totals.activeCustomers)}
              hint={t('analytics.newCustomers', { count: formatCount(totals.newCustomers) })}
              icon={<Users className="size-4" />}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
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

        <Card>
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
    </>
  );
}
