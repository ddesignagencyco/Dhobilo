'use client';

import { useTranslations } from 'next-intl';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { orderStatusKey } from '@/lib/customer/format';

const VARIANTS: Record<string, BadgeVariant> = {
  placed: 'info',
  accepted: 'info',
  picked_up: 'warning',
  in_process: 'warning',
  ready: 'warning',
  out_for_delivery: 'info',
  delivered: 'success',
  cancelled: 'muted',
  rejected: 'destructive',
};

export function OrderStatusBadge({ status }: { status: string }) {
  const t = useTranslations('customer.orders.status');
  const key = orderStatusKey(status);
  const label = t.has(key) ? t(key) : status.replaceAll('_', ' ').toLowerCase();
  return <Badge variant={VARIANTS[key] ?? 'muted'}>{label}</Badge>;
}
