import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProfileForm } from '@/components/vendor/settings/profile-form';
import { readVendorSession } from '@/lib/vendor/session';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('vendor.settings');
  const session = await readVendorSession();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>
      <ProfileForm isOwner={session?.user.role === 'VENDOR_OWNER'} />
    </div>
  );
}
