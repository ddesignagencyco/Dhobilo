import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { ComplaintsTable } from './complaints-table';

export const metadata: Metadata = { title: 'Complaints' };

export default async function ComplaintsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { status } = await searchParams;
  const t = await getTranslations('complaints');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ComplaintsTable initialStatus={status ?? 'OPEN'} />
    </>
  );
}
