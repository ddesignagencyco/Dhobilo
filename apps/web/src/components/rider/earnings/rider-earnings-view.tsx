'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Wallet } from 'lucide-react';
import { formatMoney, fromPaisa, toPaisa } from '@dhoblio/shared';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { useRiderEarnings } from '@/lib/rider/hooks';
import { cn } from '@/lib/utils';
import { MoneyCount } from '../money-count';

type Period = 'today' | 'week' | 'month';
const PERIODS: Period[] = ['today', 'week', 'month'];
const DAYS: Record<Period, number> = { today: 0, week: 6, month: 29 };

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayLabel(day: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-PK', opts);
}

function Segmented({
  value,
  onChange,
  labels,
}: {
  value: Period;
  onChange: (p: Period) => void;
  labels: Record<Period, string>;
}) {
  const index = PERIODS.indexOf(value);
  return (
    <div role="tablist" className="bg-muted relative grid grid-cols-3 rounded-2xl p-1">
      <span
        aria-hidden
        style={{ ['--i' as string]: index }}
        className="bg-background absolute inset-y-1 start-1 w-[calc((100%-0.5rem)/3)] rounded-xl shadow-xs transition-transform duration-500 ease-[var(--ease-spring)] ltr:translate-x-[calc(var(--i)*100%)] rtl:-translate-x-[calc(var(--i)*100%)]"
      />
      {PERIODS.map((p) => (
        <button
          key={p}
          role="tab"
          aria-selected={value === p}
          onClick={() => onChange(p)}
          className={cn(
            'relative z-10 h-11 text-sm font-medium transition-colors',
            value === p ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {labels[p]}
        </button>
      ))}
    </div>
  );
}

function Bars({ days, period }: { days: { day: string; jobs: number; earned: string }[]; period: Period }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const max = Math.max(1, ...days.map((d) => toPaisa(d.earned)));
  return (
    <div className="flex h-36 items-end gap-1.5" dir="ltr" role="img" aria-label="Earnings by day">
      {days.map((d, i) => {
        const pct = Math.max(4, Math.round((toPaisa(d.earned) / max) * 100));
        return (
          <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end">
              <div
                className="bg-primary/80 hover:bg-primary w-full rounded-t-md transition-all duration-700 ease-[var(--ease-out)]"
                style={{ height: grown ? `${pct}%` : '4%', transitionDelay: `${i * 25}ms` }}
                title={`${dayLabel(d.day, { day: 'numeric', month: 'short' })} · ${formatMoney(d.earned)}`}
              />
            </div>
            {period === 'week' ? (
              <span className="text-muted-foreground text-[10px] font-medium">
                {dayLabel(d.day, { weekday: 'narrow' })}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function RiderEarningsView() {
  const t = useTranslations('rider.earnings');
  const [period, setPeriod] = useState<Period>('week');

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - DAYS[period]);
    return { from: isoDay(from), to: isoDay(to) };
  }, [period]);

  const { data: earnings, isLoading, isError } = useRiderEarnings(range);

  const average = useMemo(() => {
    if (!earnings || earnings.totals.jobs === 0) return '0.00';
    return fromPaisa(Math.round(toPaisa(earnings.totals.earned) / earnings.totals.jobs));
  }, [earnings]);

  return (
    <div className="space-y-5">
      <Segmented
        value={period}
        onChange={setPeriod}
        labels={{ today: t('today'), week: t('week'), month: t('month') }}
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      ) : isError || !earnings ? (
        <EmptyState icon={<Wallet aria-hidden />} title={t('error')} />
      ) : (
        <div key={period} className="animate-fade space-y-5">
          <section className="bg-primary text-primary-foreground space-y-1 rounded-3xl p-6">
            <p className="text-primary-foreground/80 text-sm font-medium">{t('totalEarnings')}</p>
            <p className="tabular text-4xl font-semibold tracking-tight">
              <MoneyCount value={earnings.totals.earned} />
            </p>
            <p className="text-primary-foreground/80 text-sm">
              {t('deliveriesCount', { count: earnings.totals.jobs })}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <StatTile label={t('perJob')} value={<MoneyCount value={average} />} icon={<TrendingUp />} />
            <StatTile
              label={t('bestDay')}
              value={
                <MoneyCount
                  value={earnings.days.reduce(
                    (best, d) => (toPaisa(d.earned) > toPaisa(best) ? d.earned : best),
                    '0.00',
                  )}
                />
              }
            />
          </section>

          {earnings.days.length === 0 ? (
            <EmptyState icon={<Wallet aria-hidden />} title={t('noEarnings')} description={t('noEarningsHint')} />
          ) : (
            <>
              <section className="bg-card space-y-4 rounded-2xl border p-4 shadow-xs">
                <h3 className="font-semibold">{t('byDay')}</h3>
                <Bars days={earnings.days} period={period} />
              </section>

              <section className="bg-card rounded-2xl border shadow-xs">
                <ul className="stagger divide-y">
                  {[...earnings.days].reverse().map((d) => (
                    <li key={d.day} className="flex items-center justify-between gap-3 px-4 py-3.5">
                      <div>
                        <p className="text-sm font-medium">
                          {dayLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        <p className="text-muted-foreground text-xs">{t('jobsCount', { count: d.jobs })}</p>
                      </div>
                      <span className="tabular font-semibold">{formatMoney(d.earned)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
