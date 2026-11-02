'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface RankedRow {
  id: string;
  label: string;
  value: number;
  /** Shown in the tooltip and as the direct label. */
  display: string;
  /** Extra context in the tooltip, e.g. order count. */
  detail?: string;
}

/**
 * Horizontal ranked bars: magnitude by identity, which is what a "top vendors" list is.
 *
 * Horizontal, not vertical, because the category is a business name — a long label on a vertical axis
 * either rotates or truncates, and both are worse than simply reading along a row.
 *
 * One series, so one hue and no legend. The spec's marks apply: 24px cap, 4px rounded data-end with the
 * baseline end square, and a 2px surface gap between adjacent bars.
 */
export function RankedBarChart({
  rows,
  emptyLabel,
  className,
}: {
  rows: RankedRow[];
  emptyLabel?: string;
  className?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className={cn('text-muted-foreground py-8 text-center text-sm', className)}>
        {emptyLabel ?? 'No data for this range'}
      </p>
    );
  }

  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className={cn('space-y-3', className)}>
      {rows.map((row, index) => {
        const pct = (row.value / max) * 100;
        const active = hover === row.id;
        return (
          <li
            key={row.id}
            className="group relative"
            onMouseEnter={() => setHover(row.id)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm">
                <span className="text-muted-foreground me-1.5 tabular">{index + 1}.</span>
                {row.label}
              </span>
              {/* Direct label on every row is acceptable here: the rows *are* the values, there is no
                  axis, and this is the figures case the spec calls a ranked list. */}
              <span className="shrink-0 text-sm font-medium tabular">{row.display}</span>
            </div>

            {/* The track is one step off the surface; the fill is the single series hue. */}
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${Math.max(pct, 1)}%`,
                  background: 'var(--chart-1)',
                  opacity: active ? 1 : 0.85,
                }}
              />
            </div>

            {row.detail && active ? (
              <div className="bg-popover text-popover-foreground pointer-events-none absolute end-0 -top-1 z-10 rounded-md border px-2 py-1 text-xs shadow-md">
                {row.detail}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
