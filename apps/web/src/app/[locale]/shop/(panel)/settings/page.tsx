import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProfileForm } from '@/components/vendor/settings/profile-form';
import { readVendorSession } from '@/lib/vendor/session';
import { PageHeader } from '@/components/ui/page-header';

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('vendor.settings');
  const session = await readVendorSession();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ProfileForm isOwner={session?.user.role === 'VENDOR_OWNER'} />
    </div>
  );
}
