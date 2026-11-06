import { cn } from '@/lib/utils';

export const ORDER_FLOW = [
  'PLACED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_PROCESS',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

export const ACTIVE_STATUSES: string[] = ORDER_FLOW.filter((status) => status !== 'DELIVERED');
export const ENDED_BADLY = ['CANCELLED', 'REJECTED'];

/** 0..1 through the happy path; null for orders that ended some other way. */
export function orderProgress(status: string): number | null {
  const index = ORDER_FLOW.indexOf(status as (typeof ORDER_FLOW)[number]);
  return index < 0 ? null : (index + 1) / ORDER_FLOW.length;
}

/** Thin bar that grows into place; colour follows the order's outcome. */
export function ProgressBar({ status, className }: { status: string; className?: string }) {
  const value = orderProgress(status);
  if (value === null) return null;
  const done = status === 'DELIVERED';
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className={cn('bg-muted h-1.5 overflow-hidden rounded-full', className)}
    >
      <div
        key={status}
        className={cn('dh-bar-grow h-full rounded-full', done ? 'bg-success' : 'bg-primary')}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  );
}
