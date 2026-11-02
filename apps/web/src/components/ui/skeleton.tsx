import { cn } from '@/lib/utils';

/** Skeletons, never spinners (TRD §16.2): on 3G a spinner tells the user nothing about what is coming. */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('bg-accent animate-pulse rounded-md', className)} {...props} />;
}

export { Skeleton };
