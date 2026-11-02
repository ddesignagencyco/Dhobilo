import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { defaultLandingPath } from '@/lib/admin/nav';
import { currentAdmin } from '@/lib/api/server';

/**
 * /admin itself is a router, not a page. The dashboard lives at /admin/analytics, and an admin whose role
 * cannot see analytics (SUPPORT) would otherwise land on a 403 as their first impression of the panel.
 */
export default async function AdminIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const admin = await currentAdmin();
  if (!admin) redirect(`/${locale}/admin/login`);

  const landing = defaultLandingPath(admin.adminRole);
  redirect(`/${locale}/admin${landing || '/analytics'}`);
}
