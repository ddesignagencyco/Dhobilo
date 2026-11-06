import { Badge } from '@/components/ui/badge';
import { humanise } from '@/lib/format';
import { STATUS_VARIANTS } from '@/lib/status-variants';

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'} className={className}>
      {humanise(status)}
    </Badge>
  );
}
