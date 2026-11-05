import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RiderEarningsView } from '@/components/rider/earnings/rider-earnings-view';

export const metadata = { title: 'My Earnings' };

export default async function RiderEarningsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rider.earnings');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <RiderEarningsView />
    </div>
  );
}
