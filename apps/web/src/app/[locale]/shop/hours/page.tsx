import { setRequestLocale } from 'next-intl/server';
import { HoursView } from '@/components/vendor/hours/hours-view';

export default async function HoursPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HoursView />;
}
