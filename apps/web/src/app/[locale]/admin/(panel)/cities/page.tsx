import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { CitiesScreen } from './cities-screen';

export const metadata: Metadata = { title: 'Cities' };

export default async function CitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('cities');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CitiesScreen />
    </>
  );
}
