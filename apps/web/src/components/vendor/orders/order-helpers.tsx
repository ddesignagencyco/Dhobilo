'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { statusVariant } from '@/lib/status-variants';
import type { VendorOrderStatus } from '@/lib/vendor/hooks/use-vendor-orders';

export function StatusBadge({ status }: { status: VendorOrderStatus }) {
  const t = useTranslations('vendor.orders.status');
  return <Badge variant={statusVariant(status)}>{t(status)}</Badge>;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function Countdown({ until }: { until: string | null }) {
  const t = useTranslations('vendor.orders');
  const now = useNow();

  if (!until) return null;
  const remaining = new Date(until).getTime() - now;
  if (remaining <= 0) return <span className="text-destructive text-xs font-medium">{t('overdue')}</span>;
  const totalSec = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const urgent = totalSec < 180;
  return (
    <span className={`tabular text-xs font-medium ${urgent ? 'text-destructive' : 'text-warning-text'}`}>
      {t('respondIn', { time: `${mm}:${ss}` })}
    </span>
  );
}

/** The response window as a draining bar: green while there is time, amber under half, red in the last fifth. */
export function SlaMeter({ placedAt, until }: { placedAt: string; until: string | null }) {
  const t = useTranslations('vendor.orders');
  const now = useNow();
  if (!until) return null;

  const end = new Date(until).getTime();
  const start = new Date(placedAt).getTime();
  const total = Math.max(end - start, 60_000);
  const remaining = end - now;
  const fraction = Math.min(1, Math.max(0, remaining / total));
  const overdue = remaining <= 0;
  const totalSec = Math.max(0, Math.floor(remaining / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const tone = overdue || fraction < 0.2 ? 'destructive' : fraction < 0.5 ? 'warning' : 'success';

  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        className="bg-muted h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={`h-full rounded-full transition-[width,background-color] duration-1000 ease-linear ${
            tone === 'destructive' ? 'bg-destructive' : tone === 'warning' ? 'bg-warning' : 'bg-success'
          }`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <p
        className={`tabular text-xs font-medium ${
          tone === 'destructive'
            ? 'text-destructive'
            : tone === 'warning'
              ? 'text-warning-text'
              : 'text-muted-foreground'
        }`}
      >
        {overdue ? t('overdue') : t('respondIn', { time: `${mm}:${ss}` })}
      </p>
    </div>
  );
}

export function timeAgo(iso: string, locale: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en', {
    numeric: 'auto',
    style: 'narrow',
  });
  const abs = Math.abs(diffMin);
  if (abs < 60) return rtf.format(diffMin, 'minute');
  if (abs < 60 * 24) return rtf.format(Math.round(diffMin / 60), 'hour');
  return rtf.format(Math.round(diffMin / (60 * 24)), 'day');
}

function slotParts(start: string, end: string, locale: string): { day: string; time: string } {
  const tz = 'Asia/Karachi';
  const tag = locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK';
  const day = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(
    new Date(start),
  );
  const clock = new Intl.DateTimeFormat('en-PK', { hour: 'numeric', minute: '2-digit', timeZone: tz });
  return { day, time: `${clock.format(new Date(start))} – ${clock.format(new Date(end))}` };
}

export function formatSlot(start: string, end: string, locale: string): string {
  const { day, time } = slotParts(start, end, locale);
  return `${day}, ${time}`;
}

/** Day in the reader's language, time range as its own left-to-right run so Urdu text cannot scramble it. */
export function SlotText({ start, end, locale }: { start: string; end: string; locale: string }) {
  const { day, time } = slotParts(start, end, locale);
  return (
    <>
      {day},{' '}
      <bdi dir="ltr" className="tabular whitespace-nowrap">
        {time}
      </bdi>
    </>
  );
}

export function formatStamp(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  }).format(new Date(iso));
}
