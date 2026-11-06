import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RiderRegistrationView } from '@/components/rider/registration/rider-registration-view';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = { title: 'Register as Rider' };

export default async function RiderRegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('rider.register');

  return (
    <div className="mx-auto w-full space-y-6 md:max-w-2xl">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <RiderRegistrationView />
    </div>
  );
}
