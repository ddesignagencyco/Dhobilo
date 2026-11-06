import { setRequestLocale } from 'next-intl/server';
import { OrderBoard } from '@/components/vendor/orders/order-board';

export const metadata = { title: 'Orders' };

export default async function VendorOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OrderBoard />;
}
