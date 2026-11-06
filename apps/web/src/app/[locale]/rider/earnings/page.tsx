import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RiderEarningsView } from '@/components/rider/earnings/rider-earnings-view';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'My Earnings' };

export default async function RiderEarningsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rider.earnings');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <RiderEarningsView />
    </div>
  );
}
