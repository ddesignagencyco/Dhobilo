'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/admin/states';
import { PageHeader } from '@/components/admin/page-header';
import { AvailabilityToggle } from '@/components/vendor/forms/availability-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { useVendorHours, useVendorProfile } from '@/lib/vendor/hooks/use-vendor-hours';
import { HoursEditor } from './hours-editor';
import { ServiceSettings } from './service-settings';

export function HoursView() {
  const t = useTranslations('vendor.hours');
  const hours = useVendorHours();
  const profile = useVendorProfile();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <section className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{t('availability.title')}</h2>
          <p className="text-muted-foreground text-sm">{t('availability.hint')}</p>
        </div>
        <AvailabilityToggle className="hidden sm:grid" />
      </section>

      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t('weekly')}</h2>
          {hours.isLoading ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : hours.isError ? (
            <ErrorState error={hours.error} onRetry={() => void hours.refetch()} />
          ) : (
            <HoursEditor key={JSON.stringify(hours.data)} initial={hours.data ?? []} />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">{t('settings.title')}</h2>
          {profile.isLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : profile.isError || !profile.data ? (
            <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
          ) : (
            <ServiceSettings
              key={`${profile.data.serviceRadiusKm}-${profile.data.respondWithinMin}-${profile.data.slotCapacity}`}
              profile={profile.data}
            />
          )}
        </section>
      </div>
    </div>
  );
}
