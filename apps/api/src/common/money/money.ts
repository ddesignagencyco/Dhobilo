import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;

/** Money is always Decimal (never float). PKR has 2 decimals here; ties round half up. */
export const money = (value: Prisma.Decimal.Value): Money => new Prisma.Decimal(value);
export const ZERO: Money = new Prisma.Decimal(0);

export const round2 = (value: Money): Money => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export const sum = (values: Money[]): Money => values.reduce((acc, v) => acc.plus(v), ZERO);

/** "1200.5" -> "1200.50": the canonical wire format for money in API responses. */
export const fmt = (value: Money): string => round2(value).toFixed(2);

/** Parses a client-supplied amount; null when it is not a plain decimal with at most 2 places. */
export function parseMoney(input: string): Money | null {
  return /^\d{1,10}(\.\d{1,2})?$/.test(input) ? money(input) : null;
}
