import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { QueuesScreen } from './queues-screen';

export const metadata: Metadata = { title: 'Queues' };

export default async function QueuesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('queues');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <QueuesScreen />
    </>
  );
}
