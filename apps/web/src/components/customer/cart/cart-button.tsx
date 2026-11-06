'use client';

import { ShoppingBag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCart } from '@/lib/customer/cart-provider';

export function CartButton() {
  const { itemCount, hydrated } = useCart();
  const t = useTranslations('customer.cart');

  return (
    <Link
      href="/cart"
      className="bg-muted text-foreground hover:bg-accent relative flex size-9 items-center justify-center rounded-full transition-colors active:scale-95"
      aria-label={t('openCart')}
    >
      <ShoppingBag className="size-4" aria-hidden />
      {hydrated && itemCount > 0 ? (
        <span
          key={itemCount}
          className="dh-tick bg-primary text-primary-foreground tabular absolute -end-1 -top-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold"
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      ) : null}
    </Link>
  );
}
