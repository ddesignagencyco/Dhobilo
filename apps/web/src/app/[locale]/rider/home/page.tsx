import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RiderHomeView } from '@/components/rider/home/rider-home-view';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Available Jobs' };

export default async function RiderHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rider.home');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <RiderHomeView />
    </div>
  );
}
