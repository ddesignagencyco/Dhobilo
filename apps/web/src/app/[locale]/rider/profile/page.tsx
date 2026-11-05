import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RiderProfileView } from '@/components/rider/profile/rider-profile-view';

export const metadata = { title: 'My Profile' };

export default async function RiderProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rider.profile');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      </div>

      <RiderProfileView />
    </div>
  );
}
