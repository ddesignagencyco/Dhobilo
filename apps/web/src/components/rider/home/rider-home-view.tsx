'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRiderAvailableJobs, useRiderStatusToggle } from '@/lib/rider/hooks';

export function RiderHomeView() {
  const t = useTranslations('rider.home');
  const [isOnline, setIsOnline] = useState(false);

  const { data: jobs, isLoading } = useRiderAvailableJobs({ enabled: isOnline });
  const toggleStatus = useRiderStatusToggle();

  const handleToggleOnline = async () => {
    try {
      await toggleStatus.mutateAsync({ online: !isOnline });
      setIsOnline(!isOnline);
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('status')}</h2>
            <p className="text-sm text-muted-foreground">
              {isOnline ? t('online') : t('offline')}
            </p>
          </div>
          <Button
            onClick={handleToggleOnline}
            variant={isOnline ? 'default' : 'outline'}
            className="rounded-full"
          >
            {isOnline ? t('goOffline') : t('goOnline')}
          </Button>
        </div>
      </Card>

      {isOnline && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('availableJobs')}</h2>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="h-24 animate-pulse bg-muted" />
              ))}
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">{t('noJobs')}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <Card key={job.id} className="p-4 hover:bg-accent/50 cursor-pointer transition-colors">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{job.customerName}</p>
                        <p className="text-sm text-muted-foreground">
                          {job.type === 'PICKUP' ? t('pickup') : t('drop')}
                        </p>
                      </div>
                      <Button size="sm" variant="outline">
                        {t('viewDetails')}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
