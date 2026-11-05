import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RiderJobDetailView } from '@/components/rider/job/rider-job-detail-view';

export const metadata = { title: 'Job Details' };

export default async function RiderJobPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rider.job');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <RiderJobDetailView jobId={id} />
    </div>
  );
}
