'use client';

import { ShoppingBag } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useCart } from '@/lib/customer/cart-provider';
import { useTranslations } from 'next-intl';

export function CartButton() {
  const { itemCount, hydrated } = useCart();
  const t = useTranslations('customer.cart');

  return (
    <Link
      href="/cart"
      className="bg-muted text-foreground relative flex size-9 items-center justify-center rounded-full"
      aria-label={t('openCart')}
    >
      <ShoppingBag className="size-4" aria-hidden />
      {hydrated && itemCount > 0 ? (
        <span className="bg-primary text-primary-foreground absolute -end-1 -top-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      ) : null}
    </Link>
  );
}
