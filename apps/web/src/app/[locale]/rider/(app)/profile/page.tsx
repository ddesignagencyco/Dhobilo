import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RiderProfileView } from '@/components/rider/profile/rider-profile-view';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'My Profile' };

export default async function RiderProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rider.profile');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      <RiderProfileView />
    </div>
  );
}
