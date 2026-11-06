'use client';

import { ArrowRight, Loader2, ShoppingBag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatMoney, fromPaisa } from '@dhoblio/shared';
import type { Cart } from '@dhoblio/shared';
import { AnimatedNumber } from '@/components/ui/animated-number';
import type { CartEstimate } from '@/lib/customer/types';

interface CartSummaryProps {
  cart: Cart | null;
  estimate: CartEstimate | null;
  isEstimating?: boolean;
  onCheckout?: () => void;
}

/** Floating cart bar above the bottom nav: slides up the first time something is added. */
export function CartSummary({ cart, estimate, isEstimating, onCheckout }: CartSummaryProps) {
  const t = useTranslations('customer.cart');
  if (!cart || cart.items.length === 0) return null;

  const itemCount = cart.items.reduce((total, item) => total + item.quantity, 0);
  const hasDiscount = estimate ? Number(estimate.discountTotal) > 0 : false;
  const ready = !!estimate && !isEstimating;

  return (
    <div className="dh-slide-up safe-bottom pointer-events-none fixed inset-x-0 bottom-[4.75rem] z-20 px-4">
      <button
        type="button"
        onClick={onCheckout}
        disabled={!ready}
        className="bg-primary text-primary-foreground pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl px-4 py-3 text-start shadow-lg ring-1 ring-black/5 transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-80"
      >
        <span className="bg-primary-foreground/20 relative flex size-10 shrink-0 items-center justify-center rounded-xl">
          <ShoppingBag className="size-5" aria-hidden />
          <span
            key={itemCount}
            className="dh-tick bg-primary-foreground text-primary tabular absolute -end-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] leading-5 font-bold"
          >
            {itemCount}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-primary-foreground/80 block text-xs">{t('itemCount', { count: itemCount })}</span>
          {estimate ? (
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg leading-tight font-bold">
                <AnimatedNumber
                  value={Number(estimate.total)}
                  duration={500}
                  format={(n) => formatMoney(fromPaisa(Math.round(n * 100)))}
                />
              </span>
              {hasDiscount ? (
                <span className="text-primary-foreground/90 text-xs">
                  {t('youSave', { amount: formatMoney(estimate.discountTotal) })}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="block text-sm">{isEstimating ? t('estimating') : t('estimatePending')}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold">
          {isEstimating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t('viewCart')}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
        </span>
      </button>
    </div>
  );
}
