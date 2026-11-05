'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRiderAvailableJobs, useRiderStatusToggle, useRiderJobAccept } from '@/lib/rider/hooks';

export function RiderHomeView() {
  const t = useTranslations('rider.home');
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);

  const { data: jobs, isLoading, refetch } = useRiderAvailableJobs({ enabled: isOnline });
  const toggleStatus = useRiderStatusToggle();
  const acceptJob = useRiderJobAccept();

  const handleToggleOnline = async () => {
    try {
      await toggleStatus.mutateAsync({ online: !isOnline });
      setIsOnline(!isOnline);
      if (!isOnline) {
        refetch();
      }
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  const handleAcceptJob = async (jobId: string) => {
    try {
      await acceptJob.mutateAsync({ jobId });
      router.push(`/job/${jobId}`);
    } catch (error) {
      console.error('Failed to accept job:', error);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('status')}</h2>
            <div className="flex items-center gap-2 mt-2">
              <div className={`size-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
              <p className="text-sm text-muted-foreground">
                {isOnline ? t('online') : t('offline')}
              </p>
            </div>
          </div>
          <Button
            onClick={handleToggleOnline}
            variant={isOnline ? 'default' : 'outline'}
            className="rounded-full px-6"
          >
            {isOnline ? t('goOffline') : t('goOnline')}
          </Button>
        </div>
      </Card>

      {isOnline && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('availableJobs')}</h2>
            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              {t('refresh')}
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="h-28 animate-pulse bg-muted" />
              ))}
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">{t('noJobs')}</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <Card
                  key={job.id}
                  className="p-4 hover:shadow-md transition-all cursor-pointer border-l-4 border-l-primary"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold">{job.customerName}</p>
                          <Badge variant="secondary" className="text-xs">
                            {job.type === 'PICKUP' ? t('pickup') : t('drop')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          📍 {job.pickupAddress.city}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => router.push(`/job/${job.id}`)}
                      >
                        {t('viewDetails')}
                      </Button>
                    </div>

                    <button
                      onClick={() => handleAcceptJob(job.id)}
                      disabled={acceptJob.isPending}
                      className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-md font-medium transition-colors"
                    >
                      {acceptJob.isPending ? t('accepting') : t('acceptJob')}
                    </button>
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
