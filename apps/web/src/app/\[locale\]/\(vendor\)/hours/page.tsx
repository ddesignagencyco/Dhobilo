import { getTranslations } from 'next-intl/server';

export default async function VendorHoursPage() {
  const t = await getTranslations('vendor.nav');
  return <div className="space-y-4"><h1 className="text-2xl font-bold">{t('hours')}</h1></div>;
}
