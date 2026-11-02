/** Tiny scale helpers. Hand-rolled instead of pulling in d3 or Recharts: the charts here are four simple
 * forms, and TRD §16.2 budgets ~170 KB of JS per route for 3G. */

export interface Scale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const fn = ((value: number) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0))) as Scale;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** Band positions for N categories across a range, with the mark capped so the slot keeps some air. */
export function band(count: number, range: [number, number], maxThickness = 24) {
  const [r0, r1] = range;
  const step = count > 0 ? (r1 - r0) / count : 0;
  const thickness = Math.min(maxThickness, Math.max(2, step * 0.6));
  return {
    step,
    thickness,
    /** Centre of slot i. */
    center: (i: number) => r0 + step * i + step / 2,
    /** Leading edge of the mark in slot i. */
    start: (i: number) => r0 + step * i + (step - thickness) / 2,
  };
}

/**
 * A rounded upper bound and ~4 ticks. Deliberately plain: "nice" numbers beat a precise maximum, and a
 * zero baseline is never dropped, because a truncated axis exaggerates every change on it.
 */
export function niceTicks(max: number, count = 4): { max: number; ticks: number[] } {
  if (!Number.isFinite(max) || max <= 0) return { max: 1, ticks: [0, 1] };
  const rawStep = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const stepMultiple = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  const step = stepMultiple * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  return { max: top, ticks };
}

/** Smooth-ish path through points. A monotone cubic, so the curve never invents a peak between points. */
export function linePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0]!.x},${points[0]!.y}`;
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

export function areaPath(points: { x: number; y: number }[], baseline: number): string {
  if (points.length === 0) return '';
  const top = linePath(points);
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${top} L${last.x.toFixed(2)},${baseline.toFixed(2)} L${first.x.toFixed(2)},${baseline.toFixed(2)} Z`;
}
