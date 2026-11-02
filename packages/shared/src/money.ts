import { CURRENCY } from './constants';

/**
 * Money on the wire.
 *
 * The API represents money as Prisma Decimal(12,2) and serialises it with its `fmt()` helper, so every
 * amount arrives as a decimal STRING in rupees: "170.00", "1200.50". Never a number — a float would
 * reintroduce exactly the rounding the backend went to the trouble of avoiding.
 *
 * Rules for this file:
 *  - Formatting parses to a number only to hand it to Intl, which is safe: Decimal(12,2) tops out around
 *    10^10 rupees, and 10^12 paisa is far inside the 2^53 range where integers are exact.
 *  - Arithmetic (totals, differences) goes through integer paisa, never through parsed rupee floats.
 */

export type MoneyString = string;

/** "1200.50" -> 120050. Throws on anything that is not a plain 2-decimal amount, so bad data is loud. */
export function toPaisa(amount: MoneyString | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new Error(`Not a money string: ${JSON.stringify(amount)}`);
  const [, sign, whole, frac = '0'] = match;
  const paisa = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return sign === '-' ? -paisa : paisa;
}

/** 120050 -> "1200.50", the same shape the API sends, so a computed amount can go back over the wire. */
export function fromPaisa(paisa: number): MoneyString {
  const sign = paisa < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paisa));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Sum of wire amounts, exact: adds in paisa and returns a wire string. */
export function sumMoney(amounts: readonly (MoneyString | null | undefined)[]): MoneyString {
  return fromPaisa(amounts.reduce((acc, a) => acc + toPaisa(a), 0));
}

export function subtractMoney(a: MoneyString, b: MoneyString): MoneyString {
  return fromPaisa(toPaisa(a) - toPaisa(b));
}

export function compareMoney(a: MoneyString, b: MoneyString): number {
  return toPaisa(a) - toPaisa(b);
}

export function isZeroMoney(a: MoneyString | null | undefined): boolean {
  return toPaisa(a) === 0;
}

/**
 * "Rs 1,250.00". en-PK digits even in Urdu: Pakistani staff read money in Latin numerals, and a payout
 * sheet in Urdu-Indic digits is a support ticket waiting to happen.
 */
export function formatMoney(amount: MoneyString | null | undefined, opts?: { decimals?: boolean }): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const decimals = opts?.decimals ?? true;
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(toPaisa(amount) / 100);
}

/** Compact form for KPI tiles: "Rs 1.2M". Tiles show scale, the table underneath shows the exact figure. */
export function formatMoneyCompact(amount: MoneyString | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: CURRENCY,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(toPaisa(amount) / 100);
}

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-PK').format(n);
}

/** The API sends commission rates as a percentage already ("15" means 15%), not a fraction. */
export function formatRatePct(rate: string | number | null | undefined, digits = 2): string {
  if (rate === null || rate === undefined || rate === '') return '—';
  const n = typeof rate === 'number' ? rate : Number(rate);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits).replace(/\.?0+$/, '')}%`;
}

/** For ratios the UI computes itself, e.g. 0.37 -> "37.0%". */
export function formatFractionAsPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}
