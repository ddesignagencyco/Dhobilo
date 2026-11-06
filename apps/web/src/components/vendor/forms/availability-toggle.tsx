'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type Availability, useSetAvailability, useVendorProfile } from '@/lib/vendor/hooks/use-vendor-hours';

const OPTIONS: Availability[] = ['OPEN', 'BUSY', 'CLOSED'];

const THUMB: Record<Availability, string> = {
  OPEN: 'bg-success text-success-foreground',
  BUSY: 'bg-warning text-warning-foreground',
  CLOSED: 'bg-destructive text-destructive-foreground',
};

/** Open / Busy / Closed as one segmented control whose coloured thumb glides between the three states. */
export function AvailabilityToggle({ className }: { className?: string }) {
  const t = useTranslations('vendor.hours');
  const profile = useVendorProfile();
  const setAvailability = useSetAvailability();

  if (profile.isLoading) return <div className="skeleton-shimmer h-9 w-56 rounded-lg" aria-hidden />;
  if (!profile.data) return null;

  const saved = profile.data.availability;
  const current = setAvailability.isPending && setAvailability.variables ? setAvailability.variables : saved;
  const index = Math.max(0, OPTIONS.indexOf(current));

  return (
    <div
      role="radiogroup"
      aria-label={t('availability.title')}
      className={cn('bg-muted relative grid h-9 w-56 grid-cols-3 rounded-lg p-0.5', className)}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0.5 rounded-md shadow-sm transition-[inset-inline-start,background-color] duration-300 ease-[var(--ease-spring)]',
          THUMB[current],
        )}
        style={{
          width: 'calc((100% - 4px) / 3)',
          insetInlineStart: `calc(2px + ${index} * (100% - 4px) / 3)`,
        }}
      />
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
              'relative z-10 rounded-md text-xs font-semibold transition-colors duration-200 disabled:opacity-70',
              active ? 'text-inherit' : 'text-muted-foreground hover:text-foreground',
              active && option === 'OPEN' && 'text-success-foreground',
              active && option === 'BUSY' && 'text-warning-foreground',
              active && option === 'CLOSED' && 'text-destructive-foreground',
            )}
          >
            {t(`availability.${option}`)}
          </button>
        );
      })}
    </div>
  );
}
