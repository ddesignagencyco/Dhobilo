import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/admin/page-header';
import { currentAdmin } from '@/lib/api/server';
import { AdminUsersScreen } from './admin-users-screen';

export const metadata: Metadata = { title: 'Admin users' };

export default async function AdminsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admins');
  const me = await currentAdmin();

  return (
    <>
      <PageHeader title={t('title')} description={t('subtitle')} />
      {/* The API refuses to let an admin change their own role or status, so the UI needs to know who
          "me" is in order to disable those controls rather than offer a guaranteed failure. */}
      <AdminUsersScreen myId={me?.id ?? ''} />
    </>
  );
}
