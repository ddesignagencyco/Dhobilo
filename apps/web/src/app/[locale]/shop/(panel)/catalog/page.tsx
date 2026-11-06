import { setRequestLocale } from 'next-intl/server';
import { CatalogManager } from '@/components/vendor/catalog/catalog-manager';

export default async function CatalogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CatalogManager />;
}
