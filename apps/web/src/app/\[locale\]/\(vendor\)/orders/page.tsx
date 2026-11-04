import { getTranslations } from 'next-intl/server';

/**
 * Vendor order board — placeholder for Task 6.
 * Will display Kanban-style order board with NEW | IN_PROCESS | READY columns.
 */
export default async function VendorOrdersPage() {
  const t = await getTranslations('vendor.orders');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('board.title', 'Orders')}</h1>
      <p className="text-muted-foreground">{t('board.subtitle', 'Order board coming soon...')}</p>
    </div>
  );
}
