const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar date (YYYY-MM-DD) for `now` in an IANA time zone. */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA').format(now);
  }
}

export function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

export function formatDayLabel(date: string, locale: string, timeZone?: string): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timeZone ?? 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatTime(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

export function formatDateOnly(iso: string, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(new Date(iso));
}

export function formatSlotRange(
  start: string,
  end: string,
  locale: string,
  timeZone: string,
): string {
  return `${formatTime(start, locale, timeZone)} â€“ ${formatTime(end, locale, timeZone)}`;
}

/** i18n key for an order status; falls back to the raw enum when a status is new. */
export function orderStatusKey(status: string): string {
  return status.toLowerCase();
}
