import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { PayoutsTable } from './payouts-table';

export const metadata: Metadata = { title: 'Payouts' };

export default async function PayoutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { status } = await searchParams;
  const t = await getTranslations('payouts');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <PayoutsTable initialStatus={status ?? 'REQUESTED'} />
    </>
  );
}
