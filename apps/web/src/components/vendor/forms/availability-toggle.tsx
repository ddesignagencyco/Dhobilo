'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type Availability, useSetAvailability, useVendorProfile } from '@/lib/vendor/hooks/use-vendor-hours';

const OPTIONS: Availability[] = ['OPEN', 'BUSY', 'CLOSED'];

const ACTIVE_STYLE: Record<Availability, string> = {
  OPEN: 'bg-success text-success-foreground',
  BUSY: 'bg-warning text-warning-foreground',
  CLOSED: 'bg-destructive text-destructive-foreground',
};

export function AvailabilityToggle({ className }: { className?: string }) {
  const t = useTranslations('vendor.hours');
  const profile = useVendorProfile();
  const setAvailability = useSetAvailability();

  if (profile.isLoading) return <div className="bg-muted h-9 w-48 animate-pulse rounded-md" aria-hidden />;
  if (!profile.data) return null;

  const saved = profile.data.availability;
  const current = setAvailability.isPending && setAvailability.variables ? setAvailability.variables : saved;

  return (
    <div
      role="radiogroup"
      aria-label={t('availability.title')}
      className={cn('bg-muted inline-flex rounded-md p-0.5', className)}
    >
      {OPTIONS.map((option) => {
        const active = current === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={setAvailability.isPending}
            onClick={() => {
              if (option === saved) return;
              setAvailability.mutate(option, {
                onSuccess: () => toast.success(t('availability.updated')),
                onError: (error) => toast.error(error.message),
              });
            }}
            className={cn(
              'min-h-8 rounded px-3 text-xs font-medium transition-colors disabled:opacity-70',
              active ? ACTIVE_STYLE[option] : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`availability.${option}`)}
          </button>
        );
      })}
    </div>
  );
}
