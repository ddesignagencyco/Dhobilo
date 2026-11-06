import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { RiderShell } from '@/components/rider/rider-shell';
import { currentRider } from '@/lib/rider/server';

export default async function RiderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const rider = await currentRider();
  if (!rider) redirect(`/${locale}/rider/login`);

  const initial = (rider.name?.trim() || rider.phone || '?').slice(0, 1).toUpperCase();

  return <RiderShell initial={initial}>{children}</RiderShell>;
}
