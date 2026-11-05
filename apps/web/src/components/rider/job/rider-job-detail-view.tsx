'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRiderJob, useRiderJobUpdate } from '@/lib/rider/hooks';

export function RiderJobDetailView({ jobId }: { jobId: string }) {
  const t = useTranslations('rider.job');
  const { data: job, isLoading } = useRiderJob(jobId);
  const updateStatus = useRiderJobUpdate();
  const [proofType, setProofType] = useState<'PHOTO' | 'OTP'>('PHOTO');
  const [proofValue, setProofValue] = useState('');

  const statusFlow = ['ASSIGNED', 'IN_TRANSIT', 'COMPLETED'] as const;
  const currentStatusIndex = job ? (job.status === 'IN_TRANSIT' ? 1 : job.status === 'COMPLETED' ? 2 : 0) : 0;

  const handleStatusUpdate = async (newStatus: 'IN_TRANSIT' | 'COMPLETED') => {
    try {
      await updateStatus.mutateAsync({
        jobId,
        status: newStatus,
        proofType: newStatus === 'COMPLETED' ? proofType : undefined,
        proofValue: newStatus === 'COMPLETED' ? proofValue : undefined,
      });
    } catch (_error) {
      console.error('Failed to update status:', _error);
    }
  };

  if (isLoading) {
    return <Card className="h-96 animate-pulse bg-muted" />;
  }

  if (!job) {
    return <Card className="p-6"><p>{t('notFound')}</p></Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('addresses')}</h3>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('pickupAddress')}</p>
            <p className="font-medium">{job.pickupAddress.street}</p>
            <p className="text-sm text-muted-foreground">{job.pickupAddress.city}</p>
          </div>
          <div className="h-px bg-border" />
          <div>
            <p className="text-sm text-muted-foreground">{t('dropAddress')}</p>
            <p className="font-medium">{job.dropAddress.street}</p>
            <p className="text-sm text-muted-foreground">{job.dropAddress.city}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('customer')}</h3>
        <div className="space-y-2">
          <p className="font-medium">{job.customerName}</p>
          <p className="text-sm text-muted-foreground">📞 ****{job.customerPhone.slice(-4)}</p>
          <Button size="sm" variant="outline" className="w-full mt-2">
            {t('callCustomer')}
          </Button>
          <Button size="sm" variant="outline" className="w-full">
            {t('openMaps')}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">{t('status')}</h3>
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            {statusFlow.map((status, i) => (
              <div key={status} className="flex items-center flex-1">
                <div
                  className={`size-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    i <= currentStatusIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i + 1}
                </div>
                {i < statusFlow.length - 1 && (
                  <div className={`flex-1 h-1 ${i < currentStatusIndex ? 'bg-primary' : 'bg-muted'}`} />
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            {statusFlow.map((status) => (
              <Badge key={status} variant={job.status === status ? 'default' : 'outline'}>
                {t(status.toLowerCase())}
              </Badge>
            ))}
          </div>

          {job.status === 'ASSIGNED' && (
            <Button
              onClick={() => handleStatusUpdate('IN_TRANSIT')}
              disabled={updateStatus.isPending}
              className="w-full"
              size="lg"
            >
              {updateStatus.isPending ? t('updating') : t('markInTransit')}
            </Button>
          )}

          {job.status === 'IN_TRANSIT' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('proofType')}</label>
                <div className="flex gap-2">
                  <Button
                    variant={proofType === 'PHOTO' ? 'default' : 'outline'}
                    onClick={() => setProofType('PHOTO')}
                    className="flex-1"
                  >
                    📸 {t('photo')}
                  </Button>
                  <Button
                    variant={proofType === 'OTP' ? 'default' : 'outline'}
                    onClick={() => setProofType('OTP')}
                    className="flex-1"
                  >
                    🔐 {t('otp')}
                  </Button>
                </div>
              </div>

              {proofType === 'PHOTO' ? (
                <div className="space-y-2">
                  <label className="block cursor-pointer">
                    <span className="text-sm font-medium">{t('takePhoto')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setProofValue(e.target.files?.[0]?.name || '')}
                      className="mt-2 block w-full text-sm"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-2">
                  <label>
                    <span className="text-sm font-medium">{t('enterOtp')}</span>
                    <input
                      type="text"
                      maxLength={6}
                      onChange={(e) => setProofValue(e.target.value)}
                      className="mt-2 block w-full border rounded px-3 py-2 font-mono text-2xl text-center tracking-widest"
                      placeholder="000000"
                    />
                  </label>
                </div>
              )}

              <Button
                onClick={() => handleStatusUpdate('COMPLETED')}
                disabled={updateStatus.isPending || !proofValue}
                className="w-full"
                size="lg"
              >
                {updateStatus.isPending ? t('submitting') : t('markCompleted')}
              </Button>
            </div>
          )}

          {job.status === 'COMPLETED' && (
            <div className="text-center py-4">
              <p className="text-lg font-semibold text-green-600">✓ {t('jobCompleted')}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
