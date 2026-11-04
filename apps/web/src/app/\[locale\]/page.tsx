import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

/**
 * Root page for locale: redirect to login (shared entry point for all roles).
 * The proxy middleware handles role-based routing after authentication.
 */
export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect(`/${locale}/login`);
}
