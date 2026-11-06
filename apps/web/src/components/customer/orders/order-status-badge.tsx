'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { statusVariant } from '@/lib/status-variants';
import { orderStatusKey } from '@/lib/customer/format';

export function OrderStatusBadge({ status }: { status: string }) {
  const t = useTranslations('customer.orders.status');
  const key = orderStatusKey(status);
  const label = t.has(key) ? t(key) : status.replaceAll('_', ' ').toLowerCase();
  return <Badge variant={statusVariant(key)}>{label}</Badge>;
}
