import { getTranslations } from 'next-intl/server';
export default async function VendorEarningsPage() {
  const t = await getTranslations('vendor.nav');
  return <div><h1 className="text-2xl font-bold">{t('earnings')}</h1></div>;
}
