import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegistrationWizard } from '@/components/vendor/wizard/registration-wizard';

export default async function VendorRegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('vendor.register');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>
      <RegistrationWizard locale={locale} />
    </div>
  );
}
