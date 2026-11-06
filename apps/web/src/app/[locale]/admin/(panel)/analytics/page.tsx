import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { currentAdmin } from '@/lib/api/server';
import { fetchNavCounts } from '@/lib/admin/counts';
import { AnalyticsDashboard } from './analytics-dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function AnalyticsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('analytics');
  const admin = await currentAdmin();
  const counts = await fetchNavCounts(admin?.adminRole ?? null);

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AnalyticsDashboard counts={counts} />
    </>
  );
}
