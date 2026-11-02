import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { ReportsScreen } from './reports-screen';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('reports');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ReportsScreen />
    </>
  );
}
