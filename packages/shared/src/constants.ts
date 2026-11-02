/** Values the UI needs that are not worth an API round trip. Keep in step with the API's env defaults. */

/** Pakistan: +92, 10 national digits after the leading 0 is dropped. Matches the API's phone validation. */
export const PK_PHONE_E164 = /^\+923\d{9}$/;

/** What the user types: 03XXXXXXXXX. */
export const PK_PHONE_LOCAL = /^03\d{9}$/;

export function toE164(local: string): string {
  const digits = local.replace(/\D/g, '');
  if (digits.startsWith('92')) return `+${digits}`;
  if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
  return `+92${digits}`;
}

export function toLocalPhone(e164: string): string {
  return e164.startsWith('+92') ? `0${e164.slice(3)}` : e164;
}

export const CURRENCY = 'PKR';

/** Business timezone for every date bucket the analytics endpoints return. */
export const BUSINESS_TIMEZONE = 'Asia/Karachi';

/** Cursor page sizes. Small on purpose: TRD §16.2 targets 3G. */
export const PAGE_SIZE = { default: 20, table: 25, compact: 10 } as const;
