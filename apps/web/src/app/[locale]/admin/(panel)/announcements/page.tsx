import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { AnnouncementsScreen } from './announcements-screen';

export const metadata: Metadata = { title: 'Announcements' };

export default async function AnnouncementsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('announcements');

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AnnouncementsScreen />
    </>
  );
}
