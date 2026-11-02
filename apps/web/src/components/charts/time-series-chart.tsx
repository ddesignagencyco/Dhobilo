'use client';

import { useId, useMemo, useState } from 'react';
import { areaPath, band, linePath, linear, niceTicks } from './scales';
import { cn } from '@/lib/utils';

export interface SeriesSpec {
  key: string;
  label: string;
  /** 1 or 2 — the two validated categorical slots. A third needs the validator re-run. */
  slot: 1 | 2;
  values: number[];
  /** How a value reads in the tooltip, e.g. money or a plain count. */
  format: (value: number) => string;
}

/**
 * Line / area chart over time, with a crosshair and tooltip.
 *
 * Deliberate choices, per the data-viz rules:
 *  - One y-axis, always. Two measures of different magnitude get two charts, never a second axis —
 *    GMV and commission on one scale would flatten commission into the baseline.
 *  - Zero baseline, never truncated.
 *  - 2px lines, >= 8px end markers with a 2px surface ring, a 10% area wash, hairline solid gridlines.
 *  - A legend whenever there are two series; a single series is named by the card title instead.
 *  - Labels are selective: the end value only, never a number on every point.
 */
export function TimeSeriesChart({
  labels,
  series,
  height = 220,
  area = false,
  yFormat,
  emptyLabel,
  className,
}: {
  /** One label per point, already formatted for display. */
  labels: string[];
  series: SeriesSpec[];
  height?: number;
  /** Fill under the line. Only sensible with a single series. */
  area?: boolean;
  yFormat?: (value: number) => string;
  emptyLabel?: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [hover, setHover] = useState<number | null>(null);

  const padding = { top: 12, right: 16, bottom: 28, left: 52 };
  const width = 760; // viewBox width; the SVG scales to its container
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const { max, ticks } = useMemo(() => {
    const peak = Math.max(0, ...series.flatMap((s) => s.values.filter(Number.isFinite)));
    return niceTicks(peak);
  }, [series]);

  const x = linear([0, Math.max(1, labels.length - 1)], [padding.left, padding.left + plotW]);
  const y = linear([0, max], [padding.top + plotH, padding.top]);
  const slots = band(labels.length, [padding.left, padding.left + plotW]);

  const isEmpty = labels.length === 0 || series.every((s) => s.values.every((v) => !v));

  if (isEmpty) {
    return (
      <div
        className={cn('text-muted-foreground flex items-center justify-center text-sm', className)}
        style={{ height }}
      >
        {emptyLabel ?? 'No data for this range'}
      </div>
    );
  }

  // Show at most ~7 x labels, so they never collide on a 30-day range.
  const labelStride = Math.max(1, Math.ceil(labels.length / 7));

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={series.map((s) => s.label).join(', ')}
        onMouseLeave={() => setHover(null)}
      >
        {/* Gridlines: hairline, solid, recessive. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={padding.left + plotW}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-chart-grid"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-chart-axis text-[10px]"
            >
              {(yFormat ?? ((v: number) => String(v)))(tick)}
            </text>
          </g>
        ))}

        {labels.map((label, i) =>
          i % labelStride === 0 ? (
            <text
              key={`${label}-${i}`}
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-chart-axis text-[10px]"
            >
              {label}
            </text>
          ) : null,
        )}

        {series.map((s) => {
          const points = s.values.map((value, i) => ({ x: x(i), y: y(Number.isFinite(value) ? value : 0) }));
          const colour = s.slot === 1 ? 'var(--chart-1)' : 'var(--chart-2)';
          return (
            <g key={s.key}>
              {area ? (
                <path d={areaPath(points, y(0))} fill={colour} opacity={0.1} />
              ) : null}
              <path
                d={linePath(points)}
                fill="none"
                stroke={colour}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* End marker: >= 8px with a 2px ring in the surface colour so it survives an overlap. */}
              {points.length ? (
                <circle
                  cx={points[points.length - 1]!.x}
                  cy={points[points.length - 1]!.y}
                  r={4}
                  fill={colour}
                  stroke="var(--chart-surface)"
                  strokeWidth={2}
                />
              ) : null}
            </g>
          );
        })}

        {/* Crosshair and the hover dots. */}
        {hover !== null ? (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padding.top}
              y2={padding.top + plotH}
              className="stroke-chart-axis"
              strokeWidth={1}
            />
            {series.map((s) => {
              const value = s.values[hover];
              if (!Number.isFinite(value)) return null;
              return (
                <circle
                  key={s.key}
                  cx={x(hover)}
                  cy={y(value as number)}
                  r={4}
                  fill={s.slot === 1 ? 'var(--chart-1)' : 'var(--chart-2)'}
                  stroke="var(--chart-surface)"
                  strokeWidth={2}
                />
              );
            })}
          </g>
        ) : null}

        {/* Hit targets: one invisible band per point, wider than the marks. */}
        {labels.map((label, i) => (
          <rect
            key={`hit-${uid}-${i}`}
            x={slots.start(i) - (slots.step - slots.thickness) / 2}
            y={padding.top}
            width={Math.max(slots.step, 8)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            tabIndex={-1}
          />
        ))}
      </svg>

      {hover !== null ? (
        <div
          className="bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 rounded-md border px-2.5 py-1.5 text-xs shadow-md"
          style={{
            // Keep the tooltip inside the card: flip it to the other side past the midpoint.
            [hover > labels.length / 2 ? 'left' : 'right']: '8px',
          }}
        >
          <p className="mb-1 font-medium">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ background: s.slot === 1 ? 'var(--chart-1)' : 'var(--chart-2)' }}
                aria-hidden
              />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ms-auto font-medium tabular">{s.format(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </div>
      ) : null}

      {/* A legend is always present for two or more series; one series is named by the card title. */}
      {series.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-4 ps-12">
          {series.map((s) => (
            <span key={s.key} className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: s.slot === 1 ? 'var(--chart-1)' : 'var(--chart-2)' }}
                aria-hidden
              />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
