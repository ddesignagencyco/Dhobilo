import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { humanise } from '@/lib/format';

/**
 * One place that decides what colour a status is, so the same state never reads green on one screen and
 * grey on another.
 *
 * The mapping is semantic: `success` means finished well or money settled, `warning` means waiting on
 * somebody, `destructive` means failed or refused, `info` means in flight, `muted` means inert.
 */
const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  // Orders
  PLACED: 'warning',
  ACCEPTED: 'info',
  REJECTED: 'destructive',
  PICKED_UP: 'info',
  IN_PROCESS: 'info',
  READY: 'info',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  CANCELLED: 'muted',

  // Vendors and riders
  PENDING: 'warning',
  APPROVED: 'success',
  SUSPENDED: 'destructive',

  // Availability
  OPEN: 'success',
  CLOSED: 'muted',
  BUSY: 'warning',

  // Payments
  PAID: 'success',
  FAILED: 'destructive',
  REFUNDED: 'muted',
  COD_PENDING: 'warning',
  COD_COLLECTED: 'success',

  // Delivery jobs
  UNASSIGNED: 'warning',
  ASSIGNED: 'info',
  IN_TRANSIT: 'info',
  COMPLETED: 'success',

  // Payouts
  REQUESTED: 'warning',

  // Complaints
  IN_REVIEW: 'info',
  VENDOR_RESPONDED: 'info',
  RESOLVED: 'success',

  // Reports and announcements
  QUEUED: 'warning',
  RUNNING: 'info',
  SENDING: 'info',
  SENT: 'success',
  EXPIRED: 'muted',

  // Users
  ACTIVE: 'success',
  DEACTIVATED: 'muted',
};

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'} className={className}>
      {humanise(status)}
    </Badge>
  );
}
