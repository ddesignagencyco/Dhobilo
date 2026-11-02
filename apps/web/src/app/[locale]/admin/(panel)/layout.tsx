import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { MobileNav } from '@/components/admin/mobile-nav';
import { SidebarNav } from '@/components/admin/sidebar';
import { UserMenu } from '@/components/admin/user-menu';
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
  const counts = await fetchNavCounts(admin.adminRole);

  return (
    <div className="bg-muted/30 min-h-dvh">
      {/* Sidebar, desktop only. Fixed so the long tables scroll under it rather than pushing it away. */}
      <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 start-0 z-30 hidden w-64 overflow-y-auto border-e lg:block">
        <div className="border-sidebar-border flex h-14 items-center gap-2 border-b px-5">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-sm font-semibold">
            D
          </span>
          <Link href="/admin" className="font-semibold tracking-tight">
            {t('common.appName')}
          </Link>
          <span className="text-muted-foreground ms-auto text-xs">{t('common.adminPanel')}</span>
        </div>
        <SidebarNav adminRole={admin.adminRole} counts={counts} />
      </aside>

      <div className="lg:ps-64">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
          <MobileNav adminRole={admin.adminRole} counts={counts} />

          <Link href="/admin" className="font-semibold lg:hidden">
            {t('common.appName')}
          </Link>

          <div className="ms-auto flex items-center gap-2">
            <UserMenu name={admin.name} email={admin.email} adminRole={admin.adminRole} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
