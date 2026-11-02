import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { DispatchBoard } from './dispatch-board';

export const metadata: Metadata = { title: 'Dispatch' };

export default async function DeliveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { status } = await searchParams;
  const t = await getTranslations('delivery');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <DispatchBoard initialStatus={status ?? 'UNASSIGNED'} />
    </>
  );
}
