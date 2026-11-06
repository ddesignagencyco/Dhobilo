'use client';

import { ChevronRight, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddresses } from '@/lib/customer/hooks/use-addresses';
import { cn } from '@/lib/utils';

/** Shows where the order will go (the default saved address) and takes you to change it. */
export function LocationChip({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const t = useTranslations('customer.home');
  const addresses = useAddresses();
  const address = addresses.data?.find((a) => a.isDefault) ?? addresses.data?.[0];

  if (addresses.isLoading) return <Skeleton className={cn('h-9 w-44 rounded-full', className)} />;

  const label = address ? address.label || address.area || address.line1 : t('addAddress');
  const detail = address ? (address.area ?? address.line1) : null;

  return (
    <Link
      href="/profile#addresses"
      className={cn(
        'group inline-flex max-w-full items-center gap-2 rounded-full py-1.5 ps-2 pe-3 text-start transition-all active:scale-[0.98]',
        onDark ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-card hover:bg-accent border shadow-xs',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full',
          onDark ? 'bg-white/20' : 'bg-primary/10 text-primary',
        )}
      >
        <MapPin className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 leading-tight">
        <span className={cn('block text-[10px] font-medium', onDark ? 'opacity-80' : 'text-muted-foreground')}>
          {t('deliverTo')}
        </span>
        <span className="block truncate text-sm font-semibold">
          {detail && detail !== label ? `${label} · ${detail}` : label}
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
