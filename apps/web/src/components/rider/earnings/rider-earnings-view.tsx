'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { useRiderEarnings } from '@/lib/rider/hooks';

export function RiderEarningsView() {
  const t = useTranslations('rider.earnings');
  const { data: earnings, isLoading } = useRiderEarnings();

  if (isLoading) {
    return <Card className="h-96 animate-pulse bg-muted" />;
  }

  if (!earnings) {
    return <Card className="p-6"><p>{t('error')}</p></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('today')}</p>
          <p className="text-2xl font-bold">Rs. {earnings.todayEarnings.toFixed(2)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t('week')}</p>
          <p className="text-2xl font-bold">Rs. {earnings.weekEarnings.toFixed(2)}</p>
        </Card>
      </div>
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">{t('total')}</p>
        <p className="text-3xl font-bold">Rs. {earnings.totalEarnings.toFixed(2)}</p>
      </Card>
    </div>
  );
}
