import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StaffManager } from '@/components/vendor/staff/staff-manager';
import { PageHeader } from '@/components/ui/page-header';

export default async function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('vendor.staff');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <StaffManager />
    </div>
  );
}
