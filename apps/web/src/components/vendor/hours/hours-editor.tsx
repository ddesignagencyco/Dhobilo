'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { type HoursEntry, useSetVendorHours } from '@/lib/vendor/hooks/use-vendor-hours';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const STEP = 30;

interface DayState {
  open: boolean;
  opensAt: number;
  closesAt: number;
}

function karachiWeekday(): number {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })).getDay();
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function options(from: number, to: number, current: number): number[] {
  const list: number[] = [];
  for (let v = from; v <= to; v += STEP) list.push(v);
  if (!list.includes(current)) list.push(current);
  return list.sort((a, b) => a - b);
}

function fromServer(hours: HoursEntry[]): Record<number, DayState> {
  const byDay: Record<number, DayState> = {};
  for (let d = 0; d < 7; d++) byDay[d] = { open: false, opensAt: 540, closesAt: 1260 };
  for (const h of hours)
    byDay[h.dayOfWeek] = {
      open: true,
      opensAt: h.opensAt,
      closesAt: h.closesAt,
    };
  return byDay;
}

export function HoursEditor({ initial }: { initial: HoursEntry[] }) {
  const t = useTranslations('vendor.hours');
  const save = useSetVendorHours();
  const [days, setDays] = useState(() => fromServer(initial));

  const patch = (day: number, next: Partial<DayState>) =>
    setDays((prev) => ({ ...prev, [day]: { ...prev[day]!, ...next } }));

  const invalid = (d: DayState) => d.open && d.closesAt <= d.opensAt;
  const anyInvalid = Object.values(days).some(invalid);
  const anyOpen = Object.values(days).some((d) => d.open);

  const submit = () => {
    const hours: HoursEntry[] = DAY_ORDER.filter((day) => days[day]!.open).map((day) => ({
      dayOfWeek: day,
      opensAt: days[day]!.opensAt,
      closesAt: days[day]!.closesAt,
    }));
    save.mutate(hours, {
      onSuccess: () => toast.success(t('saved')),
      onError: (error) => toast.error(error.message),
    });
  };

  const today = karachiWeekday();

  const applyToAll = (source: number) =>
    setDays((prev) => {
      const from = prev[source]!;
      const next = { ...prev };
      for (const day of DAY_ORDER) next[day] = { open: from.open, opensAt: from.opensAt, closesAt: from.closesAt };
      return next;
    });

  return (
    <div className="space-y-4">
      <ul className="bg-card stagger divide-y overflow-hidden rounded-xl border shadow-xs">
        {DAY_ORDER.map((day) => {
          const d = days[day]!;
          const is24h = d.open && d.opensAt === 0 && d.closesAt === 1440;
          const bad = invalid(d);
          const left = (d.opensAt / 1440) * 100;
          const width = Math.max(0, ((d.closesAt - d.opensAt) / 1440) * 100);
          return (
            <li
              key={day}
              className={cn(
                'flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5 transition-colors',
                day === today && 'bg-accent/40',
              )}
            >
              <div className="flex w-40 items-center gap-3">
                <Switch
                  id={`day-${day}`}
                  checked={d.open}
                  onCheckedChange={(open) => patch(day, { open })}
                  aria-label={t(`days.${day}`)}
                />
                <label htmlFor={`day-${day}`} className="text-sm font-medium">
                  {t(`days.${day}`)}
                </label>
                {day === today ? (
                  <span className="bg-primary text-primary-foreground rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                    {t('today')}
                  </span>
                ) : null}
              </div>

              <div className="min-w-48 flex-1 basis-56" dir="ltr" aria-hidden>
                <div className="bg-muted relative h-2.5 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      'absolute inset-y-0 rounded-full transition-[left,width,background-color] duration-500 ease-[var(--ease-out)]',
                      d.open ? (bad ? 'bg-destructive' : 'bg-primary') : 'bg-transparent',
                    )}
                    style={{ left: `${left}%`, width: `${d.open ? width : 0}%` }}
                  />
                </div>
                <div className="text-muted-foreground tabular mt-1 flex justify-between text-[10px]">
                  <span>00</span>
                  <span>06</span>
                  <span>12</span>
                  <span>18</span>
                  <span>24</span>
                </div>
              </div>

              {!d.open ? (
                <span className="text-muted-foreground w-56 text-sm">{t('closed')}</span>
              ) : (
                <div className="flex w-56 flex-wrap items-center gap-2">
                  <select
                    aria-label={`${t(`days.${day}`)} ${t('opensAt')}`}
                    value={d.opensAt}
                    onChange={(e) => patch(day, { opensAt: Number(e.target.value) })}
                    dir="ltr"
                    className="bg-background tabular h-9 rounded-lg border px-2 text-sm"
                  >
                    {options(0, 1410, d.opensAt).map((v) => (
                      <option key={v} value={v}>
                        {formatMinutes(v)}
                      </option>
                    ))}
                  </select>
                  <span className="text-muted-foreground text-sm">{t('to')}</span>
                  <select
                    aria-label={`${t(`days.${day}`)} ${t('closesAt')}`}
                    value={d.closesAt}
                    onChange={(e) => patch(day, { closesAt: Number(e.target.value) })}
                    dir="ltr"
                    aria-invalid={bad}
                    className="bg-background tabular aria-[invalid=true]:border-destructive h-9 rounded-lg border px-2 text-sm"
                  >
                    {options(30, 1440, d.closesAt).map((v) => (
                      <option key={v} value={v}>
                        {formatMinutes(v)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex min-w-24 items-center gap-1">
                {is24h ? <span className="text-muted-foreground text-xs">{t('open24h')}</span> : null}
                {bad ? <span className="text-destructive text-xs">{t('invalid')}</span> : null}
                {d.open && !is24h ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => patch(day, { opensAt: 0, closesAt: 1440 })}
                  >
                    {t('set24h')}
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => applyToAll(day)}>
                  {t('applyAll')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {!anyOpen ? <p className="text-muted-foreground text-sm">{t('allClosedWarning')}</p> : null}

      <Button type="button" onClick={submit} disabled={anyInvalid || save.isPending} className="min-w-32">
        {save.isPending ? <Loader2 className="animate-spin" /> : null}
        {save.isPending ? t('saving') : t('save')}
      </Button>
    </div>
  );
}
