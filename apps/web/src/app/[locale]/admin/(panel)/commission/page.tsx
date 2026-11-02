import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { CommissionScreen } from './commission-screen';

export const metadata: Metadata = { title: 'Commission' };

export default async function CommissionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('commission');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CommissionScreen />
    </>
  );
}
