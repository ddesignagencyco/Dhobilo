/**
 * Small timezone helpers on top of Intl (no date library). Times are stored in UTC and shown in the city's
 * timezone (Asia/Karachi, TRD §5.1); "local" below always means the city's wall clock.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateString(value: string): boolean {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

/**
 * Building an Intl.DateTimeFormat is expensive (tens of microseconds and a lot of garbage); slot lists call this
 * dozens of times per request, so one formatter per timezone is kept for the life of the process.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Offset of `tz` from UTC at `instant`, in ms (Asia/Karachi = +5h). */
export function tzOffsetMs(instant: Date, tz: string): number {
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const p of formatterFor(tz).formatToParts(instant)) {
    switch (p.type) {
      case 'year': year = +p.value; break;
      case 'month': month = +p.value; break;
      case 'day': day = +p.value; break;
      case 'hour': hour = +p.value; break;
      case 'minute': minute = +p.value; break;
      case 'second': second = +p.value; break;
    }
  }
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export interface LocalParts {
  /** YYYY-MM-DD on the city's wall clock */
  date: string;
  /** 0 = Sunday ... 6 = Saturday */
  dayOfWeek: number;
  /** Minutes since local midnight */
  minutes: number;
}

export function localParts(instant: Date, tz: string): LocalParts {
  const wall = new Date(instant.getTime() + tzOffsetMs(instant, tz));
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`,
    dayOfWeek: wall.getUTCDay(),
    minutes: wall.getUTCHours() * 60 + wall.getUTCMinutes(),
  };
}

/** The UTC instant at which the city's wall clock reads `dateStr` + `minutes` after midnight. */
export function localToUtc(dateStr: string, minutes: number, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d) + minutes * 60_000;
  // Two passes so the offset is evaluated at the resulting instant (matters around DST changes).
  let utc = wallAsUtc - tzOffsetMs(new Date(wallAsUtc), tz);
  utc = wallAsUtc - tzOffsetMs(new Date(utc), tz);
  return new Date(utc);
}

export function dayOfWeekOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}
