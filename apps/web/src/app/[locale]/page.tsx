import { redirect } from 'next/navigation';

/**
 * Nothing lives at the bare locale root; the only product here is the admin panel. Send `/en` and `/ur`
 * straight to `/admin`, where `proxy.ts`'s route guard takes over (sign-in page or panel, depending on
 * session).
 */
export default async function LocaleRootPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/admin`);
}
