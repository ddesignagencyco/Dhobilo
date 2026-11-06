'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SERVICE_TYPES } from '@/components/customer/service-types';
import { cn } from '@/lib/utils';

/** Horizontally scrolling service pills. With `href` they are links; with `onSelect` they are toggles. */
export function ServiceChips({
  active,
  onSelect,
  className,
}: {
  active?: string;
  onSelect?: (value: string | undefined) => void;
  className?: string;
}) {
  const t = useTranslations('customer.services');

  const base =
    'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-200 active:scale-95';

  return (
    <div className={cn('no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1', className)}>
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          aria-pressed={!active}
          className={cn(
            base,
            !active ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-card hover:bg-accent',
          )}
        >
          {t('all')}
        </button>
      ) : null}
      {SERVICE_TYPES.map(({ value, icon: Icon }) => {
        const selected = active === value;
        const classes = cn(
          base,
          selected ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-card hover:bg-accent',
        );
        const content = (
          <>
            <Icon className="size-4" aria-hidden />
            {t(value)}
          </>
        );
        return onSelect ? (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? undefined : value)}
            className={classes}
          >
            {content}
          </button>
        ) : (
          <Link key={value} href={{ pathname: '/discovery', query: { serviceType: value } }} className={classes}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
