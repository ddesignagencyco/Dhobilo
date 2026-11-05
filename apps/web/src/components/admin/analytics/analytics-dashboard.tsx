'use client';

import { Card } from '@/components/ui/card';

export function AnalyticsDashboard() {
  const stats = {
    totalOrders: 1250,
    revenue: 187500,
    avgRating: 4.6,
    activeUsers: 340,
    growth: 12.5,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {Object.entries(stats).map(([key, value]) => (
          <Card key={key} className="p-4">
            <p className="text-xs text-muted-foreground capitalize">{key}</p>
            <p className="text-2xl font-bold mt-2">
              {typeof value === 'number' && value > 100 ? `${value.toLocaleString()}` : value}
            </p>
          </Card>
        ))}
      </div>

      <Card className="p-6 h-64 flex items-center justify-center text-muted-foreground">
        Chart placeholder - wire to analytics API
      </Card>
    </div>
  );
}
