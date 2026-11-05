import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { CartView } from '@/components/customer/cart/cart-view';

export const metadata: Metadata = { title: 'Cart' };

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CartView />;
}
