import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Stat tile: label, value, optional delta.
 *
 * `upIsGood` exists because direction is not meaning. Orders up is good; cancellations up is not, and
 * painting both green because the arrow points up is the kind of thing a dashboard gets quietly wrong.
 *
 * The value uses proportional figures (a standalone number, not a column), per the figures spec.
 */
export function StatTile({
  label,
  value,
  delta,
  upIsGood = true,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  /** Fractional change against the comparison period, e.g. 0.12 for +12%. */
  delta?: number | null;
  upIsGood?: boolean;
  hint?: string;
  icon?: ReactNode;
}) {
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);
  const up = hasDelta && delta > 0;
  const flat = hasDelta && Math.abs(delta) < 0.005;
  const good = up === upIsGood;

  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-muted-foreground text-xs">{label}</p>
          {icon ? <span className="text-muted-foreground/60">{icon}</span> : null}
        </div>

        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>

        {hasDelta && !flat ? (
          <p
            className={cn(
              'mt-1 flex items-center gap-1 text-xs font-medium',
              good ? 'text-success' : 'text-destructive',
            )}
          >
            {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
            {/* Sign is explicit as well as the arrow: never colour alone. */}
            {`${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`}
            {hint ? <span className="text-muted-foreground font-normal">{hint}</span> : null}
          </p>
        ) : hint ? (
          <p className="text-muted-foreground mt-1 text-xs">{flat ? `≈0% ${hint}` : hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
