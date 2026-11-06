import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OrderList } from '@/components/customer/orders/order-list';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Orders' };

export default async function CustomerOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('customer.orders');

  return (
    <div className="space-y-4">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <OrderList />
    </div>
  );
}
