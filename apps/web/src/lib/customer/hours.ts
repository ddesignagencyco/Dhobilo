import type { VendorHours } from './types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 0 = Sunday, in the vendor's own time zone (the same convention the API stores). */
export function dayOfWeekIn(timeZone: string, now = new Date()): number {
  try {
    const name = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(now);
    const index = WEEKDAYS.indexOf(name);
    return index >= 0 ? index : now.getUTCDay();
  } catch {
    return now.getUTCDay();
  }
}

export function formatMinutes(minutes: number, locale: string): string {
  const clamped = Math.min(Math.max(minutes, 0), 1439);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, 0, 1, Math.floor(clamped / 60), clamped % 60)),
  );
}

export type TodayHours = { kind: 'closed' } | { kind: 'allDay' } | { kind: 'range'; from: string; to: string };

export function todayHours(hours: VendorHours[], timeZone: string, locale: string): TodayHours {
  const today = hours.find((h) => h.dayOfWeek === dayOfWeekIn(timeZone));
  if (!today || today.closesAt <= today.opensAt) return { kind: 'closed' };
  if (today.opensAt === 0 && today.closesAt >= 1440) return { kind: 'allDay' };
  return { kind: 'range', from: formatMinutes(today.opensAt, locale), to: formatMinutes(today.closesAt, locale) };
}
