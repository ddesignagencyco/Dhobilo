'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Period = 'day' | 'week' | 'month';

export function VendorEarningsDashboard() {
  const t = useTranslations('vendor.earnings');
  const [period, setPeriod] = useState<Period>('week');

  const earnings = {
    day: { revenue: 12500, commission: 1250, net: 11250, orders: 45 },
    week: { revenue: 87500, commission: 8750, net: 78750, orders: 315 },
    month: { revenue: 375000, commission: 37500, net: 337500, orders: 1340 },
  };

  const current = earnings[period];

  const recentOrders = [
    { id: 'ORD001', amount: 1250, commission: 125, net: 1125, status: 'DELIVERED' },
    { id: 'ORD002', amount: 950, commission: 95, net: 855, status: 'DELIVERED' },
    { id: 'ORD003', amount: 2100, commission: 210, net: 1890, status: 'PROCESSING' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(['day', 'week', 'month'] as const).map((p) => (
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

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground font-medium">{t('revenue')}</p>
          <p className="text-2xl font-bold mt-2">Rs. {current.revenue.toLocaleString()}</p>
        </Card>
        <Card className="p-4 bg-orange-50 border-orange-200">
          <p className="text-xs text-muted-foreground font-medium">{t('commission')}</p>
          <p className="text-2xl font-bold mt-2 text-orange-600">
            -Rs. {current.commission.toLocaleString()}
          </p>
        </Card>
        <Card className="p-4 bg-green-50 border-green-200">
          <p className="text-xs text-muted-foreground font-medium">{t('net')}</p>
          <p className="text-2xl font-bold mt-2 text-green-600">Rs. {current.net.toLocaleString()}</p>
        </Card>
      </div>

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">{t('totalOrders')}</p>
        <p className="text-3xl font-bold mt-1">{current.orders}</p>
      </Card>

      <div>
        <h3 className="font-semibold mb-4">{t('recentOrders')}</h3>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">{t('order')}</th>
                <th className="text-right p-3 font-medium">{t('amount')}</th>
                <th className="text-right p-3 font-medium">{t('commission')}</th>
                <th className="text-right p-3 font-medium">{t('net')}</th>
                <th className="text-left p-3 font-medium">{t('status')}</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{order.id}</td>
                  <td className="text-right p-3">Rs. {order.amount.toLocaleString()}</td>
                  <td className="text-right p-3 text-orange-600">-Rs. {order.commission}</td>
                  <td className="text-right p-3 font-semibold">Rs. {order.net.toLocaleString()}</td>
                  <td className="p-3">
                    <Badge
                      variant={order.status === 'DELIVERED' ? 'default' : 'secondary'}
                    >
                      {t(order.status.toLowerCase())}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
