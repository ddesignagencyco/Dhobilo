import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegistrationWizard } from '@/components/vendor/wizard/registration-wizard';
import { PageHeader } from '@/components/ui/page-header';

export default async function VendorRegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('vendor.register');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <RegistrationWizard locale={locale} />
    </div>
  );
}
