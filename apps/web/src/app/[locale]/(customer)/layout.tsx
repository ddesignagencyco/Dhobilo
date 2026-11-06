import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import '@/styles/customer.css';
import { BottomNav } from '@/components/customer/bottom-nav';
import { CustomerHeader } from '@/components/customer/customer-header';
import { CartProvider } from '@/lib/customer/cart-provider';
import { currentCustomer } from '@/lib/customer/server';

/**
 * The customer shell. Phones get a compact top bar and a fixed bottom nav, the pattern customers already know
 * from every other delivery app. From md up the bottom nav gives way to a full top navigation and the content
 * uses the screen: a fluid container capped at 1440px so ultrawide monitors do not stretch it.
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
        <CustomerHeader initial={initial} name={customer.name?.trim() || customer.phone || ''} />

        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pt-3 pb-28 sm:px-6 md:pt-6 md:pb-12 lg:px-10">
          {children}
        </main>

        <BottomNav />
      </div>
    </CartProvider>
  );
}
