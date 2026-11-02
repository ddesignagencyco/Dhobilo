import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { PromosScreen } from './promos-screen';

export const metadata: Metadata = { title: 'Promos' };

export default async function PromosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('promos');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <PromosScreen />
    </>
  );
}
