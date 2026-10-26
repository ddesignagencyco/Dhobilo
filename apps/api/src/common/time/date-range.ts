import { HttpStatus } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { addDays, isValidDateString, localToUtc } from './zoned';

const TZ = 'Asia/Karachi';

/** A run of whole Pakistan-time days: `from` and `to` are inclusive dates, `start`/`end` the matching UTC instants. */
export interface DayRange {
  from: string;
  to: string;
  days: string[];
  start: Date;
  /** Exclusive: the first instant after `to` ends. */
  end: Date;
}

export function dayBounds(day: string): { start: Date; end: Date } {
  return { start: localToUtc(day, 0, TZ), end: localToUtc(addDays(day, 1), 0, TZ) };
}

/**
 * Turns the `from` / `to` query dates into a validated range of days. Missing `to` = today, missing `from` =
 * `defaultDays` days ending at `to`. Ranges are capped so one request cannot ask for years of data.
 */
export function resolveDayRange(
  input: { from?: string; to?: string },
  today: string,
  opts: { defaultDays: number; maxDays: number },
): DayRange {
  const bad = (message: string) => new AppException('INVALID_RANGE', message, HttpStatus.BAD_REQUEST);
  for (const [name, value] of [['from', input.from], ['to', input.to]] as const) {
    if (value !== undefined && !isValidDateString(value)) throw bad(`"${name}" must be a real date like 2026-10-24`);
  }
  const to = input.to ?? today;
  const from = input.from ?? addDays(to, -(opts.defaultDays - 1));
  if (from > to) throw bad('"from" must not be after "to"');

  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push(d);
    if (days.length > opts.maxDays) throw bad(`The range can cover at most ${opts.maxDays} days`);
  }
  return { from, to, days, start: dayBounds(from).start, end: dayBounds(to).end };
}
