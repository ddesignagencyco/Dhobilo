'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { useRiderJob } from '@/lib/rider/hooks';

export function RiderJobDetailView({ jobId }: { jobId: string }) {
  const t = useTranslations('rider.job');
  const { data: job, isLoading } = useRiderJob(jobId);

  if (isLoading) {
    return <Card className="h-96 animate-pulse bg-muted" />;
  }

  if (!job) {
    return <Card className="p-6"><p>{t('notFound')}</p></Card>;
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold">{t('customer')}</h3>
          <p>{job.customerName}</p>
        </div>
        <div>
          <h3 className="font-semibold">{t('status')}</h3>
          <p>{job.status}</p>
        </div>
      </div>
    </Card>
  );
}
