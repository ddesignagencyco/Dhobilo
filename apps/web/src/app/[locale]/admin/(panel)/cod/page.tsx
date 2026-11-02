import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { CodScreen } from './cod-screen';

export const metadata: Metadata = { title: 'Cash collection' };

export default async function CodPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('cod');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CodScreen />
    </>
  );
}
