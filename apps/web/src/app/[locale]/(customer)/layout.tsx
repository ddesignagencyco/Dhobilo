import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BottomNav } from '@/components/customer/bottom-nav';
import { currentCustomer } from '@/lib/customer/server';

/**
 * The customer shell: a compact top bar and a fixed bottom nav, the pattern customers already know
 * from every other delivery app. Mobile-first; the content column maxes out at 3xl on a tablet.
 *
 * Middleware already guards these routes. The cookie read here is belt and braces (and cheap), so a
 * direct server render can never show a shell without a customer.
 */
export default async function CustomerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const customer = await currentCustomer();
  if (!customer) redirect(`/${locale}/login`);

  const t = await getTranslations();
  const initial = (customer.name?.trim() || customer.phone || '?').slice(0, 1).toUpperCase();

  return (
    <div className="bg-muted/30 flex min-h-dvh flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-sm font-semibold">
              D
            </span>
            <span className="font-semibold tracking-tight">{t('customer.brand')}</span>
          </Link>

          <Link
            href="/profile"
            className="bg-accent text-accent-foreground ms-auto flex size-9 items-center justify-center rounded-full text-sm font-semibold"
            aria-label={t('customer.nav.profile')}
          >
            {initial}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-24">{children}</main>

      <BottomNav />
    </div>
  );
}
