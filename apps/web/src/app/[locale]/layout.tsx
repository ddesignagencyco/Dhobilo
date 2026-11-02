import type { Metadata } from 'next';
import { Inter, Noto_Nastaliq_Urdu } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Toaster } from '@/components/ui/sonner';
import { QueryProvider } from '@/components/providers/query-provider';
import { routing, textDirection } from '@/i18n/routing';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/**
 * Nastaliq is a large face. It is loaded only for `ur` (see the conditional below) and subset to the
 * Arabic range, because pulling ~400 KB of font onto a 3G connection would blow the budget in TRD §16.2
 * on its own.
 */
const notoUrdu = Noto_Nastaliq_Urdu({
  subsets: ['arabic'],
  variable: '--font-noto-urdu',
  display: 'swap',
  weight: ['400', '600'],
});

export const metadata: Metadata = {
  title: { default: 'Dhoblio Admin', template: '%s · Dhoblio Admin' },
  description: 'Dhoblio operations panel',
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const dir = textDirection(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={locale === 'ur' ? notoUrdu.variable : undefined}>
      <body className={`${inter.variable} min-h-dvh antialiased`}>
        <NextIntlClientProvider>
          <QueryProvider>{children}</QueryProvider>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
