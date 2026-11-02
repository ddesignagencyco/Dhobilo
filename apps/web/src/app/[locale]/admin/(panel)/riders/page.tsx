import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { RidersTable } from './riders-table';

export const metadata: Metadata = { title: 'Riders' };

export default async function RidersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { status } = await searchParams;
  const t = await getTranslations('riders');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <RidersTable initialStatus={status ?? 'PENDING'} />
    </>
  );
}
