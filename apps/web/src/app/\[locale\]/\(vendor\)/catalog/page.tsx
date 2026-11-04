import { getTranslations } from 'next-intl/server';

export default async function VendorCatalogPage() {
  const t = await getTranslations('vendor.nav');
  return <div className="space-y-4"><h1 className="text-2xl font-bold">{t('catalog')}</h1><p className="text-muted-foreground">Catalog manager coming soon</p></div>;
}
