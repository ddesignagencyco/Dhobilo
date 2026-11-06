import { TZDate } from '@date-fns/tz';
import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import { BUSINESS_TIMEZONE } from '@dhoblio/shared';

/**
 * Dates in the panel are always shown in Pakistan time.
 *
 * The API buckets every analytics day and report range by Pakistan business days, and the staff reading
 * these screens are in Pakistan. Rendering in the browser's own timezone would put an order placed at
 * 00:30 PKT on the previous day for anyone travelling, and the numbers would stop matching the reports.
 */

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : parseISO(value);
  return isValid(date) ? date : null;
}

function inBusinessTz(value: string | Date | null | undefined): TZDate | null {
  const date = toDate(value);
  return date ? new TZDate(date, BUSINESS_TIMEZONE) : null;
}

/** "24 Oct 2026, 3:45 pm" */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = inBusinessTz(value);
  return d ? format(d, 'd MMM yyyy, h:mm a') : '—';
}

/** "24 Oct 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  const d = inBusinessTz(value);
  return d ? format(d, 'd MMM yyyy') : '—';
}

/** "3:45 pm" */
export function formatTime(value: string | Date | null | undefined): string {
  const d = inBusinessTz(value);
  return d ? format(d, 'h:mm a') : '—';
}

/** "2026-10-24", the shape every date filter and report range uses on the wire. */
export function formatIsoDate(value: string | Date | null | undefined): string {
  const d = inBusinessTz(value);
  return d ? format(d, 'yyyy-MM-dd') : '';
}

/** "3 min ago" / "in 2 h". For dispatch boards, where the age of a job is the whole point. */
export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  const distance = formatDistanceToNowStrict(date, { addSuffix: true });
  return distance.replace(' minutes', ' min').replace(' minute', ' min').replace(' hours', ' h').replace(' hour', ' h');
}

/** Today in Pakistan, as the API's date format. The default end of every range filter. */
export function businessToday(): string {
  return format(new TZDate(new Date(), BUSINESS_TIMEZONE), 'yyyy-MM-dd');
}

/** N days before today in Pakistan. */
export function businessDaysAgo(days: number): string {
  const now = new TZDate(new Date(), BUSINESS_TIMEZONE);
  return format(new TZDate(now.getTime() - days * 86_400_000, BUSINESS_TIMEZONE), 'yyyy-MM-dd');
}

/** Masks a phone for screens where staff do not need the full number. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  return phone.length > 6 ? `${phone.slice(0, 6)}••••${phone.slice(-2)}` : phone;
}

/** Turns an enum member into readable text: OUT_FOR_DELIVERY -> "Out for delivery". */
export function humanise(value: string | null | undefined): string {
  if (!value) return '—';
  const lower = value.replace(/_/g, ' ').toLowerCase();
  const sentence = lower.charAt(0).toUpperCase() + lower.slice(1);
  // Acronyms keep their case: "COD pending", not "Cod pending".
  return sentence.replace(/\b(cod|cnic|sms|otp|iban|gmv)\b/gi, (m) => m.toUpperCase());
}
