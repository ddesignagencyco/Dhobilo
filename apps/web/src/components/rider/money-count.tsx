'use client';

import { formatMoney, fromPaisa, toPaisa } from '@dhoblio/shared';
import { AnimatedNumber } from '@/components/ui/animated-number';

/** A wire money string ("1200.00") that counts up to its value. Latin digits and "Rs" in every locale. */
export function MoneyCount({ value, decimals = true }: { value: string | null | undefined; decimals?: boolean }) {
  const rupees = toPaisa(value) / 100;
  return <AnimatedNumber value={rupees} format={(n) => formatMoney(fromPaisa(Math.round(n * 100)), { decimals })} />;
}
