'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRiderEarnings } from '@/lib/rider/hooks';

export function RiderEarningsView() {
  const t = useTranslations('rider.earnings');
  const { data: earnings, isLoading } = useRiderEarnings();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');

  if (isLoading) {
    return <Card className="h-96 animate-pulse bg-muted" />;
  }

  if (!earnings) {
    return <Card className="p-6"><p>{t('error')}</p></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(['today', 'week', 'month'] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            onClick={() => setPeriod(p)}
            className="flex-1"
            size="sm"
          >
            {t(p)}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5">
          <p className="text-xs text-muted-foreground font-medium">{t('today')}</p>
          <p className="text-2xl font-bold mt-2">Rs. {earnings.todayEarnings.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {earnings.completedJobs} {t('jobs')}
          </p>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
          <p className="text-xs text-muted-foreground font-medium">{t('thisWeek')}</p>
          <p className="text-2xl font-bold mt-2">Rs. {earnings.weekEarnings.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('pending')}: {earnings.pendingJobs}
          </p>
        </Card>
      </div>

      <Card className="p-6 border-2 border-primary">
        <p className="text-sm text-muted-foreground font-medium">{t('totalEarnings')}</p>
        <p className="text-4xl font-bold mt-3">Rs. {earnings.totalEarnings.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-2">
          {t('allTime')} • {earnings.completedJobs} {t('deliveries')}
        </p>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('recentDeliveries')}</h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b last:border-b-0">
              <div>
                <p className="text-sm font-medium">Order #{1000 + i}</p>
                <p className="text-xs text-muted-foreground">2 hours ago</p>
              </div>
              <Badge variant="secondary">Rs. 150</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('payoutStatus')}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t('availableBalance')}</span>
            <span className="font-semibold">Rs. {(earnings.totalEarnings * 0.8).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('platformFee')}</span>
            <span className="text-sm text-muted-foreground">-Rs. {(earnings.totalEarnings * 0.2).toFixed(2)}</span>
          </div>
          <Button className="w-full mt-4">
            {t('requestPayout')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
