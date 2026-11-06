import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AdminShell } from '@/components/admin/admin-shell';
import { currentAdmin } from '@/lib/api/server';
import { fetchNavCounts } from '@/lib/admin/counts';

/**
 * The admin shell: fixed sidebar on desktop, slide-over on phones.
 *
 * The session is already guaranteed by middleware, which redirects anyone without one to the login page.
 * The check here is belt and braces for the case where middleware is bypassed (a direct server render in
 * a test, say) — and it is cheap, because it only reads a cookie.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const admin = await currentAdmin();
  if (!admin) redirect(`/${locale}/admin/login`);

  const t = await getTranslations();
  const initialDark = (await cookies()).get('dh-theme')?.value === 'dark';
  const counts = await fetchNavCounts(admin.adminRole);

  return (
    <AdminShell
      admin={{ name: admin.name, email: admin.email, adminRole: admin.adminRole }}
      counts={counts}
      appName={t('common.appName')}
      adminLabel={t('common.adminPanel')}
      initialDark={initialDark}
    >
      {children}
    </AdminShell>
  );
}
