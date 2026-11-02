import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { OrdersTable } from './orders-table';

export const metadata: Metadata = { title: 'Orders' };

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('orders');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <OrdersTable />
    </>
  );
}
