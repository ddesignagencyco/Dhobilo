'use client';

import { ReceiptText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOrders, useReorderOrder } from '@/lib/customer/hooks/use-orders';
import { formatDateTime } from '@/lib/customer/format';
import { OrderStatusBadge } from './order-status-badge';

export function OrderList() {
  const t = useTranslations('customer.orders');
  const locale = useLocale();
  const reorderOrder = useReorderOrder();
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useOrders();

  const orders = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('loadError')}</AlertDescription>
      </Alert>
    );
  }

  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-xl">
            <ReceiptText className="size-5" aria-hidden />
          </div>
          <CardTitle className="text-base">{t('empty')}</CardTitle>
          <CardDescription>{t('emptyHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/discovery">{t('browse')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <Link key={order.id} href={`/orders/${order.id}`} className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{order.vendor.businessName}</p>
                  <p className="text-muted-foreground text-xs">{order.orderNo}</p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span>{formatDateTime(order.placedAt, locale)}</span>
                <span>{t('itemCount', { count: order.itemCount })}</span>
                <span className="text-foreground font-semibold">{formatMoney(order.total)}</span>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void reorderOrder
                      .mutateAsync({ orderId: order.id })
                      .then(() => toast.success(t('reorderDone')))
                      .catch(() => toast.error(t('reorderError')));
                  }}
                  disabled={reorderOrder.isPending}
                >
                  {t('reorder')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}

      {hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? t('loading') : t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
