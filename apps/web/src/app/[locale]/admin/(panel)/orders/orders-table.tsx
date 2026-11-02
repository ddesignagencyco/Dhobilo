'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { OrderStatus, formatMoney } from '@dhoblio/shared';
import { Link } from '@/i18n/navigation';
import { EnumFilter, FilterBar, SearchFilter } from '@/components/admin/filter-bar';
import { LoadMore } from '@/components/admin/load-more';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { StatusBadge } from '@/components/admin/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AdminOrderListItem } from '@/lib/api/types';
import { formatDateTime, humanise } from '@/lib/format';
import { useCursorList } from '@/lib/hooks/use-cursor-list';

const STATUSES = [
  OrderStatus.PLACED,
  OrderStatus.ACCEPTED,
  OrderStatus.REJECTED,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_PROCESS,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
] as const;

/**
 * The support tool: find an order, see where it is, cancel it if you must.
 *
 * Filters are exactly the ones the API offers (AdminOrdersQueryDto): status, vendorId, customerId and a
 * partial order number. There is deliberately no city or date filter here — the endpoint has neither, and
 * a filter that silently does nothing is worse than no filter. Date-ranged order data lives in Reports.
 */
export function OrdersTable() {
  const t = useTranslations();
  const [status, setStatus] = useState('');
  const [orderNo, setOrderNo] = useState('');

  const list = useCursorList<AdminOrderListItem>({
    key: ['admin', 'orders', { status, orderNo }],
    path: '/admin/orders',
    query: { status: status || undefined, orderNo: orderNo || undefined },
  });

  const hasFilters = !!status || !!orderNo;

  return (
    <>
      <FilterBar
        hasFilters={hasFilters}
        onClear={() => {
          setStatus('');
          setOrderNo('');
        }}
      >
        <SearchFilter value={orderNo} onChange={setOrderNo} placeholder={t('orders.searchPlaceholder')} />
        <EnumFilter
          value={status}
          onChange={setStatus}
          options={STATUSES}
          anyLabel={t('common.all')}
          ariaLabel={t('common.status')}
          width="w-44"
        />
      </FilterBar>

      {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.orderNumber')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('common.vendor')}</TableHead>
              <TableHead>{t('common.customer')}</TableHead>
              <TableHead className="text-end">{t('common.total')}</TableHead>
              <TableHead>{t('orders.payment')}</TableHead>
              <TableHead>{t('orders.placed')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isInitialLoading ? (
              <TableSkeleton columns={7} />
            ) : list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={<ClipboardList className="size-8" />}
                    title={t('orders.empty')}
                    hint={hasFilters ? t('common.noResultsHint') : t('orders.emptyHint')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-mono text-xs font-medium hover:text-primary hover:underline"
                      dir="ltr"
                    >
                      {order.orderNo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="max-w-40 truncate">{order.vendor?.businessName ?? '—'}</TableCell>
                  <TableCell className="max-w-40 truncate">
                    {order.customer?.name ?? order.customer?.phone ?? '—'}
                  </TableCell>
                  <TableCell className="text-end font-medium tabular">{formatMoney(order.total)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="outline">{humanise(order.paymentMethod)}</Badge>
                      {order.paymentStatus ? <StatusBadge status={order.paymentStatus} /> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDateTime(order.placedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <LoadMore
          shown={list.items.length}
          hasNextPage={!!list.hasNextPage}
          isLoading={list.isLoadingMore}
          onLoadMore={() => void list.fetchNextPage()}
        />
      </Card>
    </>
  );
}
