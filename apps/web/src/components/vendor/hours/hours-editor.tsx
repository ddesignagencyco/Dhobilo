'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { type HoursEntry, useSetVendorHours } from '@/lib/vendor/hooks/use-vendor-hours';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const STEP = 30;

interface DayState {
  open: boolean;
  opensAt: number;
  closesAt: number;
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

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border bg-card">
        {DAY_ORDER.map((day) => {
          const d = days[day]!;
          const is24h = d.open && d.opensAt === 0 && d.closesAt === 1440;
          const bad = invalid(d);
          return (
            <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <div className="flex w-32 items-center gap-3">
                <Switch
                  id={`day-${day}`}
                  checked={d.open}
                  onCheckedChange={(open) => patch(day, { open })}
                  aria-label={t(`days.${day}`)}
                />
                <label htmlFor={`day-${day}`} className="text-sm font-medium">
                  {t(`days.${day}`)}
                </label>
              </div>

              {!d.open ? (
                <span className="text-muted-foreground text-sm">{t('closed')}</span>
              ) : (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <select
                    aria-label={`${t(`days.${day}`)} ${t('opensAt')}`}
                    value={d.opensAt}
                    onChange={(e) => patch(day, { opensAt: Number(e.target.value) })}
                    dir="ltr"
                    className="bg-background h-9 rounded-md border px-2 text-sm"
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
                    className="bg-background aria-[invalid=true]:border-destructive h-9 rounded-md border px-2 text-sm"
                  >
                    {options(30, 1440, d.closesAt).map((v) => (
                      <option key={v} value={v}>
                        {formatMinutes(v)}
                      </option>
                    ))}
                  </select>
                  {is24h ? <span className="text-muted-foreground text-xs">{t('open24h')}</span> : null}
                  {bad ? <span className="text-destructive text-xs">{t('invalid')}</span> : null}
                </div>
              )}

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
            </li>
          );
        })}
      </ul>

      {!anyOpen ? <p className="text-muted-foreground text-sm">{t('allClosedWarning')}</p> : null}

      <Button type="button" onClick={submit} disabled={anyInvalid || save.isPending}>
        {save.isPending ? <Loader2 className="animate-spin" /> : null}
        {save.isPending ? t('saving') : t('save')}
      </Button>
    </div>
  );
}
