'use client';

import { PackageSearch } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link, useRouter } from '@/i18n/navigation';
import {
  useRiderAvailableJobs,
  useRiderJobAction,
  useRiderMe,
  useRiderMyJobs,
  useRiderOnlineToggle,
} from '@/lib/rider/hooks';
import { JobSummary } from '../job/job-card-parts';
import { EmptyState } from '@/components/ui/empty-state';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message === 'LOCATION_UNAVAILABLE') return fallback;
  return error instanceof Error ? error.message : fallback;
}

export function RiderHomeView() {
  const t = useTranslations('rider.home');
  const router = useRouter();

  const me = useRiderMe();
  const isOnline = me.data?.isOnline ?? false;
  const approved = me.data?.status === 'APPROVED';

  const available = useRiderAvailableJobs({ enabled: isOnline && approved });
  const mine = useRiderMyJobs();
  const toggle = useRiderOnlineToggle();
  const action = useRiderJobAction();

  if (me.isLoading) return <Card className="bg-muted h-32 animate-pulse" />;

  if (me.isError || !me.data) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <p className="text-muted-foreground">{t('notRegistered')}</p>
        <Button asChild>
          <Link href="/rider/register">{t('register')}</Link>
        </Button>
      </Card>
    );
  }

  if (!approved) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <p className="font-medium">{t(`application.${me.data.status}`)}</p>
        {me.data.rejectionReason && <p className="text-muted-foreground text-sm">{me.data.rejectionReason}</p>}
        <Button asChild variant="outline">
          <Link href="/rider/register">{t('viewApplication')}</Link>
        </Button>
      </Card>
    );
  }

  const handleToggle = () =>
    toggle.mutate({ online: !isOnline }, { onError: (e) => toast.error(errorMessage(e, t('locationRequired'))) });

  const handleAction = (jobId: string, kind: 'claim' | 'accept' | 'decline') =>
    action.mutate(
      { jobId, action: kind },
      {
        onSuccess: () => {
          if (kind !== 'decline') router.push(`/rider/job/${jobId}`);
        },
        onError: (e) => toast.error(errorMessage(e, t('actionFailed'))),
      },
    );

  const myJobs = mine.data ?? [];
  const jobs = available.data ?? [];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t('status')}</h2>
            <div className="mt-2 flex items-center gap-2">
              <div className={`size-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
              <p className="text-muted-foreground text-sm">{isOnline ? t('online') : t('offline')}</p>
            </div>
          </div>
          <Button
            onClick={handleToggle}
            disabled={toggle.isPending}
            variant={isOnline ? 'default' : 'outline'}
            className="rounded-full px-6"
          >
            {isOnline ? t('goOffline') : t('goOnline')}
          </Button>
        </div>
      </Card>

      {myJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t('myJobs')}</h2>
          {myJobs.map((job) => (
            <Card key={job.id} className="space-y-3 p-4">
              <JobSummary job={job} pickupLabel={t('pickup')} dropLabel={t('drop')} />
              <Button className="w-full" size="sm" onClick={() => router.push(`/rider/job/${job.id}`)}>
                {t('viewDetails')}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {isOnline && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('availableJobs')}</h2>
            <Button size="sm" variant="ghost" onClick={() => void available.refetch()}>
              {t('refresh')}
            </Button>
          </div>

          {available.isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="bg-muted h-28 animate-pulse" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState icon={<PackageSearch aria-hidden />} title={t('noJobs')} />
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <Card key={job.id} className="border-s-primary space-y-3 border-s-4 p-4">
                  <JobSummary job={job} pickupLabel={t('pickup')} dropLabel={t('drop')} />
                  {job.status === 'ASSIGNED' ? (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        disabled={action.isPending}
                        onClick={() => handleAction(job.id, 'accept')}
                      >
                        {t('acceptJob')}
                      </Button>
                      <Button
                        className="flex-1"
                        variant="outline"
                        disabled={action.isPending}
                        onClick={() => handleAction(job.id, 'decline')}
                      >
                        {t('decline')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={action.isPending}
                      onClick={() => handleAction(job.id, 'claim')}
                    >
                      {action.isPending ? t('accepting') : t('acceptJob')}
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
