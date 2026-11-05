'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import type { Cart } from '@dhoblio/shared';
import { Button } from '@/components/ui/button';
import type { CartEstimate } from '@/lib/customer/types';

interface CartSummaryProps {
  cart: Cart | null;
  estimate: CartEstimate | null;
  isEstimating?: boolean;
  onCheckout?: () => void;
}

export function CartSummary({ cart, estimate, isEstimating, onCheckout }: CartSummaryProps) {
  const t = useTranslations('customer.cart');
  if (!cart || cart.items.length === 0) return null;

  const itemCount = cart.items.reduce((total, item) => total + item.quantity, 0);
  const hasDiscount = estimate ? Number(estimate.discountTotal) > 0 : false;

  return (
    <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-14 z-20 border-t backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs">{t('itemCount', { count: itemCount })}</p>
          {estimate ? (
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-lg font-bold">{formatMoney(estimate.total)}</span>
              {hasDiscount ? (
                <span className="text-xs text-emerald-600">
                  {t('youSave', { amount: formatMoney(estimate.discountTotal) })}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{isEstimating ? t('estimating') : t('estimatePending')}</p>
          )}
        </div>

        <Button onClick={onCheckout} disabled={!estimate || isEstimating}>
          {isEstimating ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
          {t('proceed')}
        </Button>
      </div>
    </div>
  );
}
