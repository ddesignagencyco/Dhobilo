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

export function Countdown({ until }: { until: string | null }) {
  const t = useTranslations('vendor.orders');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!until) return null;
  const remaining = new Date(until).getTime() - now;
  if (remaining <= 0) return <span className="text-destructive text-xs font-medium">{t('overdue')}</span>;
  const totalSec = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  const urgent = totalSec < 180;
  return (
    <span
      className={`text-xs font-medium tabular-nums ${urgent ? 'text-destructive' : 'text-amber-700 dark:text-amber-300'}`}
    >
      {t('respondIn', { time: `${mm}:${ss}` })}
    </span>
  );
}

export function formatSlot(start: string, end: string, locale: string): string {
  const tz = 'Asia/Karachi';
  const day = new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  }).format(new Date(start));
  const time = new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  });
  return `${day}, ${time.format(new Date(start))} – ${time.format(new Date(end))}`;
}

export function formatStamp(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Karachi',
  }).format(new Date(iso));
}
