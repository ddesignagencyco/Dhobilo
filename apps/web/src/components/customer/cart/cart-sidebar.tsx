'use client';

import { ArrowRight, ShoppingBag } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney, fromPaisa } from '@dhoblio/shared';
import type { Cart } from '@dhoblio/shared';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { CartEstimate } from '@/lib/customer/types';

/** Desktop order summary for the vendor page (lg and up): stays in view beside the menu. */
export function CartSidebar({
  cart,
  estimate,
  isEstimating,
  disabled,
  onCheckout,
}: {
  cart: Cart | null;
  estimate: CartEstimate | null;
  isEstimating?: boolean;
  disabled?: boolean;
  onCheckout: () => void;
}) {
  const t = useTranslations('customer.cart');
  const locale = useLocale();
  const items = cart?.items ?? [];
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);

  return (
    <div className="bg-card overflow-hidden rounded-2xl border shadow-xs">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <ShoppingBag className="text-primary size-4" aria-hidden />
        <h2 className="flex-1 text-base font-semibold">{t('title')}</h2>
        {itemCount > 0 ? (
          <span className="bg-primary/10 text-primary tabular rounded-full px-2 py-0.5 text-xs font-semibold">
            {t('itemCount', { count: itemCount })}
          </span>
        ) : null}
      </div>

      {itemCount === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
            <ShoppingBag className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium">{t('empty')}</p>
          <p className="text-muted-foreground text-xs">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-4 p-4 text-sm">
          <ul className="space-y-2.5">
            {items.map((item) => {
              const line = estimate?.lines.find((entry) => entry.serviceItemId === item.itemId);
              return (
                <li key={item.itemId} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {line ? (locale === 'ur' && line.nameUr ? line.nameUr : line.name) : '…'}
                    </span>
                    <span className="text-muted-foreground tabular text-xs">× {item.quantity}</span>
                  </span>
                  {line ? (
                    <span className="tabular shrink-0 font-medium">{formatMoney(line.lineTotal)}</span>
                  ) : (
                    <Skeleton className="h-4 w-14" />
                  )}
                </li>
              );
            })}
          </ul>

          <div className="space-y-2 border-t border-dashed pt-3">
            {estimate ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('subtotal')}</span>
                  <span className="tabular">{formatMoney(estimate.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('deliveryFee')}</span>
                  <span className="tabular">{formatMoney(estimate.deliveryFee)}</span>
                </div>
                {Number(estimate.discountTotal) > 0 ? (
                  <div className="text-success-text flex justify-between">
                    <span>{t('discount')}</span>
                    <span className="tabular">-{formatMoney(estimate.discountTotal)}</span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between border-t pt-2 text-base font-bold">
                  <span>{t('total')}</span>
                  <span className="text-lg">
                    <AnimatedNumber
                      value={Number(estimate.total)}
                      duration={500}
                      format={(n) => formatMoney(fromPaisa(Math.round(n * 100)))}
                    />
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">{isEstimating ? t('estimating') : t('estimatePending')}</p>
            )}
          </div>

          <Button
            size="lg"
            className="h-12 w-full rounded-xl text-base"
            onClick={onCheckout}
            disabled={disabled || !estimate || !!isEstimating}
          >
            {t('viewCart')}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
