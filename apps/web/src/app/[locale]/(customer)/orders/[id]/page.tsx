import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { OrderDetailView } from '@/components/customer/orders/order-detail-view';

export const metadata: Metadata = { title: 'Order' };

export default async function CustomerOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { locale, id } = await params;
  const { placed } = await searchParams;
  setRequestLocale(locale);
  return <OrderDetailView orderId={id} placed={placed === '1'} />;
}
