import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Compact rating pill. A vendor with no reviews shows a neutral 'New' pill instead of a misleading 0.0. */
export function RatingPill({
  value,
  count,
  newLabel,
  className,
}: {
  value: number;
  count: number;
  newLabel: string;
  className?: string;
}) {
  if (count === 0) {
    return (
      <span
        className={cn(
          'bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
          className,
        )}
      >
        {newLabel}
      </span>
    );
  }
  return (
    <span
      dir="ltr"
      className={cn(
        'bg-warning/20 text-warning-text tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        className,
      )}
    >
      <Star className="size-3 fill-current" aria-hidden />
      {value.toFixed(1)}
      <span className="font-normal opacity-70">({count})</span>
    </span>
  );
}
