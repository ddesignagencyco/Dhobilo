import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { CodCollectionScreen } from '@/components/rider/cod/cod-collection-screen';

export const metadata = { title: 'Cash on delivery' };

export default async function RiderCodPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rider.cod');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />
      <CodCollectionScreen />
    </div>
  );
}
