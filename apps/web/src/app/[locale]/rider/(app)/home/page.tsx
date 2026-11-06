import { setRequestLocale } from 'next-intl/server';
import { RiderHomeView } from '@/components/rider/home/rider-home-view';

export const metadata = { title: 'Jobs' };

export default async function RiderHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <RiderHomeView />;
}
