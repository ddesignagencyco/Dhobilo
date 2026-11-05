import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { CheckoutView } from '@/components/customer/checkout/checkout-view';

export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CheckoutView />;
}
