import * as React from 'react';
import { cn } from '@/lib/utils';

function StatTile({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('bg-card flex flex-col gap-2 rounded-xl border p-4 shadow-xs', className)}>
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs font-medium">
        <span>{label}</span>
        {icon ? <span className="[&>svg]:size-4">{icon}</span> : null}
      </div>
      <div className="tabular text-2xl leading-none font-semibold tracking-tight">{value}</div>
      {hint ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
    </div>
  );
}

export { StatTile };
