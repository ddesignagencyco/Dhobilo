import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { VendorsTable } from './vendors-table';

export const metadata: Metadata = { title: 'Vendors' };

export default async function VendorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { status } = await searchParams;
  const t = await getTranslations('vendors');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {/* Deep links from the sidebar badge and from email land on the pending queue. */}
      <VendorsTable initialStatus={status ?? 'PENDING'} />
    </>
  );
}
