'use client';

import { useState } from 'react';
import { ChevronRight, ReceiptText, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatMoney } from '@dhoblio/shared';
import { toast } from 'sonner';
import { Link } from '@/i18n/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Monogram } from '@/components/customer/ui/monogram';
import { useOrders, useReorderOrder } from '@/lib/customer/hooks/use-orders';
import { formatDateTime } from '@/lib/customer/format';
import { cn } from '@/lib/utils';
import { OrderStatusBadge } from './order-status-badge';
import { ACTIVE_STATUSES, ProgressBar } from './order-progress';

type Tab = 'active' | 'completed';

export function OrderList() {
  const t = useTranslations('customer.orders');
  const locale = useLocale();
  const reorderOrder = useReorderOrder();
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useOrders();
  const [tab, setTab] = useState<Tab>('active');

  const orders = data?.pages.flatMap((page) => page.items) ?? [];
  const activeOrders = orders.filter((order) => ACTIVE_STATUSES.includes(order.status));
  const completedOrders = orders.filter((order) => !ACTIVE_STATUSES.includes(order.status));
  const shown = tab === 'active' ? activeOrders : completedOrders;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-11 rounded-full" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
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
      <EmptyState
        className="py-16"
        icon={<ReceiptText aria-hidden />}
        title={t('empty')}
        description={t('emptyHint')}
        action={
          <Button asChild>
            <Link href="/discovery">{t('browse')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div role="tablist" className="bg-muted relative grid grid-cols-2 rounded-full p-1 md:max-w-sm">
        <span
          aria-hidden
          className={cn(
            'bg-background absolute inset-y-1 start-1 w-[calc(50%-0.25rem)] rounded-full shadow-sm transition-transform duration-300 ease-[var(--ease-spring)]',
            tab === 'completed' && 'translate-x-full rtl:-translate-x-full',
          )}
        />
        {(['active', 'completed'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'relative z-10 flex items-center justify-center gap-2 rounded-full py-2 text-sm font-medium transition-colors',
              tab === value ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {t(value === 'active' ? 'tabActive' : 'tabCompleted')}
            <span className="bg-primary/10 text-primary tabular rounded-full px-1.5 text-xs">
              {value === 'active' ? activeOrders.length : completedOrders.length}
            </span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<ReceiptText aria-hidden />}
          title={t(tab === 'active' ? 'noneActive' : 'noneCompleted')}
          action={
            tab === 'active' ? (
              <Button asChild variant="outline">
                <Link href="/discovery">{t('browse')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div
          key={tab}
          className="stagger space-y-3 md:grid md:grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] md:gap-4 md:space-y-0"
        >
          {shown.map((order) => (
            <div key={order.id} className="bg-card hover-lift relative rounded-2xl border p-4 shadow-xs">
              <Link href={`/orders/${order.id}`} className="absolute inset-0 rounded-2xl" aria-label={order.orderNo} />
              <div className="flex items-start gap-3">
                <Monogram name={order.vendor.businessName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold">{order.vendor.businessName}</p>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <p className="text-muted-foreground tabular text-xs">{order.orderNo}</p>
                </div>
              </div>

              {tab === 'active' ? <ProgressBar status={order.status} className="mt-3" /> : null}

              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="text-muted-foreground space-y-0.5 text-xs">
                  <p>{formatDateTime(order.placedAt, locale)}</p>
                  <p className="tabular">{t('itemCount', { count: order.itemCount })}</p>
                </div>
                <div className="relative z-10 flex items-center gap-2">
                  {tab === 'completed' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        void reorderOrder
                          .mutateAsync({ orderId: order.id })
                          .then(() => toast.success(t('reorderDone')))
                          .catch(() => toast.error(t('reorderError')));
                      }}
                      disabled={reorderOrder.isPending}
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      {t('reorder')}
                    </Button>
                  ) : null}
                  <span className="tabular text-base font-bold">{formatMoney(order.total)}</span>
                  <ChevronRight className="text-muted-foreground size-4 rtl:rotate-180" aria-hidden />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? t('loading') : t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
