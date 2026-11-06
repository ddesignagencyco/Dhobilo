import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import '@/styles/customer.css';
import { BottomNav } from '@/components/customer/bottom-nav';
import { CustomerHeader } from '@/components/customer/customer-header';
import { CartProvider } from '@/lib/customer/cart-provider';
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

  const initial = (customer.name?.trim() || customer.phone || '?').slice(0, 1).toUpperCase();

  return (
    <CartProvider>
      <div className="bg-muted/30 flex min-h-dvh flex-col">
        <CustomerHeader initial={initial} />

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-3 pb-28">{children}</main>

        <BottomNav />
      </div>
    </CartProvider>
  );
}
